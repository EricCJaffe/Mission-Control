import { supabaseServer } from '@/lib/supabase/server';
import { extractText } from 'unpdf';

export async function processLabReportUnpdf(params: {
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
      console.error('❌ Download error:', downloadError);
      return { success: false, error: 'Failed to download file' };
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    console.log(`📄 Extracting text (${uint8Array.length} bytes)`);

    const result = await extractText(uint8Array);

    // unpdf returns { totalPages, text: string[] }
    const text = Array.isArray(result.text)
      ? result.text.join('\n\n')
      : (result.text || '');

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      console.error('❌ No text extracted');
      return { success: false, error: 'PDF is empty or scanned image' };
    }

    console.log(`✅ Extracted ${text.length} characters`);

    const prompt = `Extract lab results from this text:\n\n${text}\n\nReturn JSON:\n\`\`\`json\n{"panel":{"lab_name":"","panel_date":"YYYY-MM-DD","provider_name":"","fasting":false},"results":[{"test_name":"","value":"","unit":"","reference_range":"","flag":""}]}\n\`\`\``;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      console.error('❌ OpenAI error:', response.status);
      return { success: false, error: `OpenAI error: ${response.status}` };
    }

    console.log('✅ OpenAI response received');

    const aiResponse = await response.json();
    const content = aiResponse.choices[0]?.message?.content;

    if (!content) {
      return { success: false, error: 'No content from OpenAI' };
    }

    let data: any;
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : content;
      data = JSON.parse(jsonText);
    } catch {
      console.error('❌ Parse error');
      return { success: false, error: 'Failed to parse response' };
    }

    console.log(`📊 Creating panel`);
    console.log(`📋 Extracted data:`, JSON.stringify(data, null, 2));

    const { data: panel, error: panelError } = await supabase
      .from('lab_panels')
      .insert({
        user_id: userId,
        file_id: fileId,
        lab_name: data.panel.lab_name,
        panel_date: data.panel.panel_date,
        provider_name: data.panel.provider_name || null,
        fasting: data.panel.fasting || false,
        status: 'needs_review',
      })
      .select()
      .single();

    if (panelError) {
      console.error('❌ Panel error:', panelError);
      return { success: false, error: 'Failed to create panel' };
    }

    console.log(`✅ Panel: ${panel.id}`);

    const { data: testDefs } = await supabase.from('lab_test_definitions').select('*');
    const testMap = new Map(
      testDefs?.filter(d => d.test_name).map(d => [d.test_name.toLowerCase(), d]) || []
    );

    // Filter and validate results before processing
    const validResults = data.results.filter((r: any) => {
      if (!r.test_name || !r.value) {
        console.warn('⚠️ Skipping invalid result:', r);
        return false;
      }
      return true;
    });

    console.log(`📋 Processing ${validResults.length} valid results (${data.results.length - validResults.length} skipped)`);

    const results = validResults.map((r: any) => {
      const testDef = testMap.get(r.test_name.toLowerCase().trim());
      let flag: 'normal' | 'low' | 'high' | 'critical' = 'normal';
      const f = (r.flag || '').toLowerCase();
      if (f.includes('high') || f === 'h') flag = 'high';
      else if (f.includes('low') || f === 'l') flag = 'low';
      else if (f.includes('critical')) flag = 'critical';

      return {
        user_id: userId,
        panel_id: panel.id,
        test_name: r.test_name,
        normalized_test_name: testDef?.test_name || r.test_name,
        value: r.value,
        unit: r.unit || '',
        reference_range: r.reference_range || '',
        flag,
        test_category: testDef?.category || 'other',
      };
    });

    const { error: resultsError } = await supabase.from('lab_results').insert(results);

    if (resultsError) {
      console.error('❌ Results error:', resultsError);
      return { success: false, error: 'Failed to save results' };
    }

    console.log(`✅ Done: ${results.length} results`);

    return { success: true };

  } catch (error) {
    console.error('❌ Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
