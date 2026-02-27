// Methylation Report Processor — Extracts SNP data from genetic/methylation test reports
// Generates supplement and lifestyle implications

import { supabaseServer } from '@/lib/supabase/server';
import { buildAISystemPrompt } from './health-context';

/**
 * Process methylation/genetic report PDF
 * 1. Extract PDF → send to OpenAI GPT-4o with vision
 * 2. Parse SNP data (gene, variant, rsID, genotype, status)
 * 3. Store in genetic_markers table
 * 4. Generate supplement + lifestyle implications
 * 5. Update health.md genetic section
 */
export async function processMethylationReport(params: {
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
      return { success: false, error: 'Failed to download file from storage' };
    }

    // Convert to base64 for OpenAI
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = fileData.type || 'application/pdf';

    // Call OpenAI GPT-4o with vision to extract SNP data
    const extractionPrompt = `You are extracting SNP (Single Nucleotide Polymorphism) data from a genetic/methylation test report.

Extract ALL SNPs visible in the report, focusing on these key genes:
- MTHFR (C677T, A1298C)
- COMT (V158M)
- CBS (C699T)
- VDR (Taq, Bsm, Fok)
- MTR (A2756G)
- MTRR (A66G)
- AHCY
- MAO-A
- APOE (e2/e3/e4)
- Factor V Leiden

For each SNP, extract:
- Gene name
- Variant name (e.g., C677T)
- rsID (e.g., rs1801133)
- Genotype (e.g., +/+, +/-, -/-, or specific alleles like A/A, A/G, G/G)
- Status (normal, heterozygous, homozygous)

Return JSON in this format:
\`\`\`json
{
  "snps": [
    {
      "gene": "MTHFR",
      "variant": "C677T",
      "rs_id": "rs1801133",
      "genotype": "+/-",
      "status": "heterozygous",
      "notes": "Any additional notes from report"
    }
  ]
}
\`\`\`

Be thorough. Extract EVERY SNP visible. Return ONLY the JSON.`;

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
            content: [
              { type: 'text', text: extractionPrompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 3000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      return { success: false, error: `OpenAI API error: ${response.status}` };
    }

    const aiResponse = await response.json();
    const extractedText = aiResponse.choices[0]?.message?.content;

    if (!extractedText) {
      return { success: false, error: 'No content returned from OpenAI' };
    }

    // Parse JSON from response
    let extractedData: {
      snps: Array<{
        gene: string;
        variant: string;
        rs_id: string;
        genotype: string;
        status: string;
        notes?: string;
      }>;
    };

    try {
      const jsonMatch = extractedText.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : extractedText;
      extractedData = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse extracted SNP data:', extractedText);
      return { success: false, error: 'Failed to parse AI response as JSON' };
    }

    // Store genetic markers
    const markersToInsert = extractedData.snps.map(snp => ({
      user_id: userId,
      file_id: fileId,
      gene: snp.gene,
      variant: snp.variant,
      rs_id: snp.rs_id,
      genotype: snp.genotype,
      status: snp.status,
      notes: snp.notes || null,
    }));

    const { error: insertError } = await supabase
      .from('genetic_markers')
      .insert(markersToInsert);

    if (insertError) {
      console.error('Failed to insert genetic markers:', insertError);
      return { success: false, error: 'Failed to store genetic markers' };
    }

    // Generate implications using AI with health context
    await generateMethylationAnalysis({ userId, fileId });

    // Trigger health.md update detection (non-blocking)
    try {
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('/rest/v1', '')}/api/fitness/health/detect-updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger: 'methylation_upload',
          trigger_data: {
            file_id: fileId,
            markers: extractedData.snps,
            marker_count: markersToInsert.length,
          },
        }),
      });
      console.log(`Triggered health.md update for methylation report`);
    } catch (err) {
      console.error('Failed to trigger health.md update (non-critical):', err);
    }

    return { success: true };

  } catch (error) {
    console.error('Methylation processing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Generate methylation analysis (supplement + lifestyle implications)
 * Uses AI with health context
 */
async function generateMethylationAnalysis(params: {
  userId: string;
  fileId: string;
}): Promise<void> {
  const { userId, fileId } = params;
  const supabase = await supabaseServer();

  // Load extracted SNPs
  const { data: markers } = await supabase
    .from('genetic_markers')
    .select('*')
    .eq('file_id', fileId);

  if (!markers || markers.length === 0) {
    console.error('No genetic markers found for analysis');
    return;
  }

  // Build AI prompt with health context
  const systemPrompt = await buildAISystemPrompt(userId, 'methylation_analysis');

  const userPrompt = `Analyze these genetic markers and provide actionable recommendations:

**SNP Data**:
${markers.map(m => `- ${m.gene} ${m.variant} (${m.rs_id}): ${m.genotype} (${m.status})`).join('\n')}

Return JSON:
\`\`\`json
{
  "summary": "Plain-language summary of key findings",
  "supplement_recommendations": [
    {
      "supplement": "Methylfolate (5-MTHF)",
      "reason": "MTHFR C677T heterozygous variant reduces folate metabolism efficiency",
      "dosage": "400-800 mcg daily",
      "priority": "high" | "medium" | "low"
    }
  ],
  "lifestyle_recommendations": [
    {
      "area": "Exercise",
      "recommendation": "Your COMT variant suggests better stress tolerance with moderate-intensity exercise",
      "priority": "medium"
    }
  ],
  "medication_notes": [
    {
      "medication": "Carvedilol",
      "note": "COMT variants can affect beta-blocker metabolism — monitor effectiveness"
    }
  ],
  "cardiac_relevance": "Summary of how these SNPs affect cardiac risk, exercise response, recovery"
}
\`\`\`

Return ONLY the JSON.`;

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

    const jsonMatch = analysisText.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : analysisText;
    const analysis = JSON.parse(jsonText);

    // Update file record with analysis
    await supabase
      .from('health_file_uploads')
      .update({
        processing_metadata: analysis,
      })
      .eq('id', fileId);

    // TODO: Propose health.md genetic section update (would need health doc updater)

  } catch (error) {
    console.error('Methylation analysis error:', error);
  }
}
