// Simplest Lab Processor - Uses OpenAI Assistants API with file upload
// No pdf-parse, no image conversion - just upload PDF directly to OpenAI

import { supabaseServer } from '@/lib/supabase/server';
import FormData from 'form-data';

/**
 * Process lab report using OpenAI file upload + Assistants API
 * This is the SIMPLEST approach - let OpenAI handle the PDF
 */
export async function processLabReportSimple(params: {
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
      console.error('❌ Storage download error:', downloadError);
      return { success: false, error: 'Failed to download file from storage' };
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    console.log(`📄 Processing PDF with GPT-4o (${pdfBuffer.length} bytes)`);

    // Convert PDF to base64
    const base64Pdf = pdfBuffer.toString('base64');
    console.log(`✅ PDF converted to base64 (${base64Pdf.length} characters)`);

    // Use GPT-4o to extract data - send as hex dump which it can read
    const extractionPrompt = `I'm providing a PDF lab report as base64-encoded data below. Extract ALL test results from it.

BASE64 PDF DATA:
${base64Pdf}

Return JSON in this exact format:
\`\`\`json
{
  "panel": {
    "lab_name": "Lab name from the report",
    "panel_date": "YYYY-MM-DD",
    "provider_name": "Doctor name if shown",
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

Extract EVERY test result visible. Return ONLY the JSON, no other text.`;

    // Call GPT-4o with the base64 data
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
      return { success: false, error: `OpenAI API error: ${response.status}` };
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
      const jsonMatch = extractedText.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : extractedText;
      extractedData = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('❌ Failed to parse extracted data:', extractedText);
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
      const normalizedName = result.test_name.toLowerCase().trim();
      const testDef = testDefsMap.get(normalizedName);

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
    console.error('❌ Lab processing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
