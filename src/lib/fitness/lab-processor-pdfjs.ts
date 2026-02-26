// Lab processor using pdfjs-dist (pure JavaScript, no native deps)
import { supabaseServer } from '@/lib/supabase/server';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Set worker source to the legacy worker
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  const uint8Array = new Uint8Array(pdfBuffer);
  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
  const pdf = await loadingTask.promise;

  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    fullText += pageText + '\n';
  }

  return fullText;
}

export async function processLabReportPDFJS(params: {
  userId: string;
  fileId: string;
  filePath: string;
}): Promise<{ success: boolean; error?: string }> {
  const { userId, fileId, filePath } = params;

  try {
    const supabase = await supabaseServer();

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('health-files')
      .download(filePath);

    if (downloadError || !fileData) {
      console.error('❌ Storage download error:', downloadError);
      return { success: false, error: 'Failed to download file' };
    }

    const pdfBuffer = Buffer.from(await fileData.arrayBuffer());
    console.log(`📄 Extracting text from PDF (${pdfBuffer.length} bytes)`);

    const pdfText = await extractTextFromPDF(pdfBuffer);

    if (!pdfText || pdfText.trim().length === 0) {
      console.error('❌ No text extracted from PDF');
      return { success: false, error: 'PDF appears to be empty or scanned image' };
    }

    console.log(`✅ Text extracted (${pdfText.length} characters)`);

    // Now send text to OpenAI
    const extractionPrompt = `Extract all lab test results from this text:

${pdfText}

Return JSON:
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
      "test_name": "Test name",
      "value": "95",
      "unit": "mg/dL",
      "reference_range": "< 100",
      "flag": "Normal"
    }
  ]
}
\`\`\`

Return ONLY the JSON.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: extractionPrompt }],
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenAI error:', response.status, errorText);
      return { success: false, error: `OpenAI error: ${response.status}` };
    }

    console.log('✅ OpenAI response received');

    const aiResponse = await response.json();
    const extractedText = aiResponse.choices[0]?.message?.content;

    if (!extractedText) {
      return { success: false, error: 'No content from OpenAI' };
    }

    let extractedData: any;
    try {
      const jsonMatch = extractedText.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : extractedText;
      extractedData = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('❌ Parse error:', extractedText);
      return { success: false, error: 'Failed to parse AI response' };
    }

    console.log(`📊 Creating panel: ${extractedData.panel.lab_name}`);

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
      console.error('❌ Panel error:', panelError);
      return { success: false, error: 'Failed to create panel' };
    }

    console.log(`✅ Panel created: ${panelRecord.id}`);

    const { data: testDefinitions } = await supabase
      .from('lab_test_definitions')
      .select('*');

    const testDefsMap = new Map(
      testDefinitions?.map(def => [def.test_name.toLowerCase(), def]) || []
    );

    const resultsToInsert = extractedData.results.map((result: any) => {
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
      console.error('❌ Results error:', resultsError);
      return { success: false, error: 'Failed to save results' };
    }

    console.log(`✅ Complete: ${resultsToInsert.length} results saved`);

    return { success: true };

  } catch (error) {
    console.error('❌ Processing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
