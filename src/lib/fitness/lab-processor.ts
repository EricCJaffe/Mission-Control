// Lab Report Processor — Extracts test results from PDF lab reports using GPT-4o
// Generates trend analysis and health.md update proposals

import { supabaseServer } from '@/lib/supabase/server';
import { buildAISystemPrompt } from './health-context';

/**
 * Process lab report PDF
 * 1. Extract text from PDF using pdf-parse
 * 2. Send text to OpenAI GPT-4o for parsing
 * 3. Parse all test results (name, value, unit, range, flag)
 * 4. Match against lab_test_definitions for normalization
 * 5. Create lab_panels + lab_results records (status: needs_review)
 * 6. User confirms → generate trend analysis → propose health.md updates
 */
export async function processLabReport(params: {
  userId: string;
  fileId: string;
  filePath: string;
}): Promise<{ success: boolean; error?: string }> {
  const { userId, fileId, filePath } = params;

  try {
    const supabase = await supabaseServer();

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('health-files')
      .download(filePath);

    if (downloadError || !fileData) {
      console.error('Storage download error:', downloadError);
      return { success: false, error: 'Failed to download file from storage' };
    }

    // Extract text from PDF
    const arrayBuffer = await fileData.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    console.log(`📄 Processing PDF (${pdfBuffer.length} bytes)`);

    let pdfText: string;
    try {
      // Dynamic import for pdf-parse (CommonJS module)
      const pdfParseModule = await import('pdf-parse');
      const pdfParse = pdfParseModule.default || pdfParseModule;
      const pdfData = await pdfParse(pdfBuffer);
      pdfText = pdfData.text;

      console.log(`✅ PDF text extracted (${pdfText.length} characters, ${pdfData.numpages} pages)`);

      if (!pdfText || pdfText.trim().length === 0) {
        console.error('❌ PDF appears to be empty or scanned image');
        return { success: false, error: 'PDF appears to be empty or contains only images' };
      }
    } catch (pdfError) {
      console.error('❌ PDF parsing error:', pdfError);
      return { success: false, error: 'Failed to extract text from PDF' };
    }

    // Call OpenAI GPT-4o to parse the lab data from text
    const extractionPrompt = `You are extracting data from a lab report. The text has been extracted from a PDF. Extract ALL test results with the following information:

1. **Panel Information**:
   - Lab name (e.g., "Quest Diagnostics", "LabCorp")
   - Panel date (date of blood draw)
   - Provider name/ordering physician
   - Fasting status (if mentioned)

2. **Test Results** (extract EVERY test, including):
   - Test name (exactly as written on report)
   - Value (numeric or text)
   - Unit (mg/dL, mmol/L, %, etc.)
   - Reference range (e.g., "< 100", "50-150", "Negative")
   - Flag (H for high, L for low, blank for normal)

3. **Important Tests to Look For** (but extract all, not just these):
   - Lipid panel: LDL, HDL, Total Cholesterol, Triglycerides, LDL Particle Size
   - Kidney: Creatinine, BUN, eGFR, Cystatin C
   - Liver: AST, ALT, ALP, Bilirubin
   - Metabolic: Glucose, A1C, Insulin
   - Electrolytes: Sodium, Potassium, Chloride, CO2
   - CBC: Hemoglobin, Hematocrit, WBC, Platelets
   - Thyroid: TSH, Free T3, Free T4
   - Cardiac: hs-CRP, Lipoprotein(a), Homocysteine, NT-proBNP, Troponin
   - Vitamins: Vitamin D (25-OH), B12, Folate
   - Inflammation: CRP, ESR

Return JSON in this exact format:
\`\`\`json
{
  "panel": {
    "lab_name": "Lab name",
    "panel_date": "YYYY-MM-DD",
    "provider_name": "Doctor name",
    "fasting": true/false
  },
  "results": [
    {
      "test_name": "LDL Cholesterol",
      "value": "95",
      "unit": "mg/dL",
      "reference_range": "< 100",
      "flag": "Normal"
    }
  ]
}
\`\`\`

Be thorough. Extract EVERY test result visible in the text. If a value is not visible, omit that test.
Return ONLY the JSON, no other text.

Here is the extracted text from the lab report:

${pdfText}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: extractionPrompt,
          },
        ],
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenAI API error:', response.status, errorText);
      console.error('Full error details:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      return { success: false, error: `OpenAI API error: ${response.status} - ${errorText.substring(0, 200)}` };
    }

    console.log('✅ OpenAI API response received');

    const aiResponse = await response.json();
    const extractedText = aiResponse.choices[0]?.message?.content;

    if (!extractedText) {
      return { success: false, error: 'No content returned from OpenAI' };
    }

    // Parse JSON from response
    let extractedData: {
      panel: {
        lab_name: string;
        panel_date: string;
        provider_name?: string;
        fasting?: boolean;
      };
      results: Array<{
        test_name: string;
        value: string;
        unit: string;
        reference_range: string;
        flag: string;
      }>;
    };

    try {
      // Extract JSON from markdown code block if present
      const jsonMatch = extractedText.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : extractedText;
      extractedData = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse extracted data:', extractedText);
      return { success: false, error: 'Failed to parse AI response as JSON' };
    }

    console.log(`📊 Creating lab panel: ${extractedData.panel.lab_name} (${extractedData.results.length} results)`);

    // Create lab_panels record
    const { data: panelRecord, error: panelError } = await supabase
      .from('lab_panels')
      .insert({
        user_id: userId,
        file_id: fileId,
        lab_name: extractedData.panel.lab_name,
        panel_date: extractedData.panel.panel_date,
        provider_name: extractedData.panel.provider_name || null,
        fasting: extractedData.panel.fasting || false,
        status: 'needs_review',
      })
      .select()
      .single();

    if (panelError) {
      console.error('❌ Failed to create lab panel:', panelError);
      return { success: false, error: 'Failed to create lab panel record' };
    }

    console.log(`✅ Lab panel created: ${panelRecord.id}`);

    // Load lab_test_definitions for normalization
    const { data: testDefinitions } = await supabase
      .from('lab_test_definitions')
      .select('*');

    const testDefsMap = new Map(
      testDefinitions?.map(def => [def.test_name.toLowerCase(), def]) || []
    );

    // Create lab_results records
    const resultsToInsert = extractedData.results.map(result => {
      // Try to match against known test definitions
      const normalizedName = result.test_name.toLowerCase().trim();
      const testDef = testDefsMap.get(normalizedName);

      // Determine flag
      let flag: 'normal' | 'low' | 'high' | 'critical' = 'normal';
      const flagText = result.flag.toLowerCase();
      if (flagText.includes('high') || flagText === 'h') flag = 'high';
      else if (flagText.includes('low') || flagText === 'l') flag = 'low';
      else if (flagText.includes('critical')) flag = 'critical';

      return {
        user_id: userId,
        panel_id: panelRecord.id,
        test_name: result.test_name,
        normalized_test_name: testDef?.test_name || result.test_name,
        value: result.value,
        unit: result.unit,
        reference_range: result.reference_range,
        flag,
        test_category: testDef?.category || 'other',
      };
    });

    const { error: resultsError } = await supabase
      .from('lab_results')
      .insert(resultsToInsert);

    if (resultsError) {
      console.error('❌ Failed to create lab results:', resultsError);
      return { success: false, error: 'Failed to create lab results records' };
    }

    console.log(`✅ Lab processing complete: ${resultsToInsert.length} results saved`);

    return { success: true };

  } catch (error) {
    console.error('Lab processing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Generate lab panel summary and trend analysis (after user confirms extracted data)
 * Uses AI with health context to analyze results
 */
export async function generateLabAnalysis(params: {
  userId: string;
  panelId: string;
}): Promise<{
  summary: string;
  flagged_results?: Array<{
    test_name: string;
    value: string;
    reference_range: string;
    flag: string;
    interpretation: string;
    possible_causes: string[];
    recommendations: string;
    clinical_significance: string;
  }>;
  trends: Array<{
    test_name: string;
    trend: string;
    current_value?: string;
    previous_value?: string;
    change_pct?: string;
    note: string;
  }>;
  health_doc_updates: Array<{ section: string; update: string; reason: string }>;
}> {
  const { userId, panelId } = params;
  const supabase = await supabaseServer();

  // Load panel + results
  const { data: panel } = await supabase
    .from('lab_panels')
    .select('*')
    .eq('id', panelId)
    .single();

  const { data: results } = await supabase
    .from('lab_results')
    .select('*')
    .eq('panel_id', panelId)
    .order('test_category');

  if (!panel || !results) {
    return {
      summary: 'Failed to load lab data',
      trends: [],
      health_doc_updates: [],
    };
  }

  // Load historical results for trend analysis
  const { data: historicalPanels } = await supabase
    .from('lab_panels')
    .select('id, panel_date')
    .eq('user_id', userId)
    .neq('id', panelId)
    .order('panel_date', { ascending: false })
    .limit(3);

  const historicalResults = new Map<string, Array<{ date: string; value: string; unit: string }>>();

  if (historicalPanels) {
    for (const histPanel of historicalPanels) {
      const { data: histResults } = await supabase
        .from('lab_results')
        .select('normalized_test_name, value, unit')
        .eq('panel_id', histPanel.id);

      if (histResults) {
        for (const result of histResults) {
          const key = result.normalized_test_name;
          if (!historicalResults.has(key)) {
            historicalResults.set(key, []);
          }
          historicalResults.get(key)!.push({
            date: histPanel.panel_date,
            value: result.value,
            unit: result.unit,
          });
        }
      }
    }
  }

  // Build AI prompt with health context
  const systemPrompt = await buildAISystemPrompt(userId, 'lab_analysis');

  const userPrompt = `Analyze this lab panel comprehensively:

**Panel Date**: ${panel.panel_date}
**Lab**: ${panel.lab_name}
**Provider**: ${panel.provider_name || 'Unknown'}
**Fasting**: ${panel.fasting ? 'Yes' : 'No'}

**Test Results**:
${results.map(r => `- ${r.test_name}: ${r.value} ${r.unit} (ref: ${r.reference_range}) [${r.flag}]`).join('\n')}

**Historical Data** (for trend analysis):
${Array.from(historicalResults.entries())
  .map(([test, history]) => `${test}: ${history.map(h => `${h.value} (${h.date})`).join(', ')}`)
  .join('\n') || 'No historical data available'}

Provide a COMPREHENSIVE analysis. Return JSON:
\`\`\`json
{
  "summary": "Detailed 4-6 paragraph analysis covering: (1) Overall health status, (2) Key findings and what they mean, (3) Trends over time, (4) Clinical significance, (5) Recommended actions or monitoring. Use plain language suitable for patient understanding while being medically accurate.",
  "flagged_results": [
    {
      "test_name": "BNP",
      "value": "325 pg/mL",
      "reference_range": "<100 pg/mL",
      "flag": "high",
      "interpretation": "What this means clinically",
      "possible_causes": ["Cause 1", "Cause 2"],
      "recommendations": "What to do - follow-up tests, lifestyle changes, medication review, etc.",
      "clinical_significance": "Why this matters for health"
    }
  ],
  "trends": [
    {
      "test_name": "LDL Cholesterol",
      "trend": "improving" | "worsening" | "stable" | "insufficient_data",
      "current_value": "95 mg/dL",
      "previous_value": "110 mg/dL",
      "change_pct": "-13.6%",
      "note": "Detailed explanation with numbers, context, and clinical significance"
    }
  ],
  "health_doc_updates": [
    {
      "section": "Vital Baselines & Targets",
      "update": "eGFR: 63 mL/min (previous: 60)",
      "reason": "Kidney function improved slightly"
    }
  ]
}
\`\`\`

Be thorough. For flagged results, explain clinical significance, possible causes, and actionable recommendations. Return ONLY the JSON.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2000,
      }),
    });

    const aiResponse = await response.json();
    const analysisText = aiResponse.choices[0]?.message?.content;

    // Parse JSON
    const jsonMatch = analysisText.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : analysisText;
    const analysis = JSON.parse(jsonText);

    // Save analysis to panel
    await supabase
      .from('lab_panels')
      .update({
        ai_summary: analysis.summary,
        status: 'confirmed',
      })
      .eq('id', panelId);

    return analysis;

  } catch (error) {
    console.error('Lab analysis error:', error);
    return {
      summary: 'Analysis failed',
      trends: [],
      health_doc_updates: [],
    };
  }
}
