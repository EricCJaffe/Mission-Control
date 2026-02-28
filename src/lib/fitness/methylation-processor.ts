// Methylation Report Processor — Extracts SNP data from genetic/methylation test reports
// Generates supplement and lifestyle implications

import { supabaseServer } from '@/lib/supabase/server';
import { buildAISystemPrompt } from './health-context';
import { extractText } from 'unpdf';

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

    // Extract text from PDF
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    console.log(`📄 Extracting text from methylation report (${uint8Array.length} bytes)`);

    let pdfText = '';
    try {
      const result = await extractText(uint8Array);

      // unpdf returns { totalPages, text: string[] }
      pdfText = Array.isArray(result.text)
        ? result.text.join('\n\n')
        : (result.text || '');

      if (!pdfText || typeof pdfText !== 'string' || pdfText.trim().length === 0) {
        console.error('❌ No text extracted from methylation report');
        return { success: false, error: 'PDF is empty or scanned image' };
      }

      console.log(`✅ Extracted ${pdfText.length} characters from methylation report`);
    } catch (pdfError) {
      console.error('❌ PDF parsing error:', pdfError);
      return { success: false, error: 'Failed to parse PDF file' };
    }

    // Send extracted text to GPT-4 for SNP extraction
    const extractionPrompt = `You are extracting SNP (Single Nucleotide Polymorphism) data from a genetic/methylation test report.

Below is the text extracted from a methylation report PDF. Extract ALL SNPs visible in the text, focusing on these key genes:
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

Be thorough. Extract EVERY SNP visible. Return ONLY the JSON.

---PDF TEXT---
${pdfText}
---END PDF TEXT---`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: extractionPrompt }],
        max_tokens: 3000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenAI API error:', response.status, errorText);
      return { success: false, error: `OpenAI API error: ${response.status}` };
    }

    console.log('✅ OpenAI response received for methylation extraction');

    const aiResponse = await response.json();
    const extractedText = aiResponse.choices[0]?.message?.content;

    if (!extractedText) {
      console.error('❌ No content returned from OpenAI');
      return { success: false, error: 'No content returned from OpenAI' };
    }

    // Parse JSON from response
    let extractedData: {
      snps: Array<{
        gene: string;
        variant?: string;
        rs_id: string;
        genotype: string;
        status: string;
        notes?: string;
        clinical_significance?: string;
        supplement_implications?: string;
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

    // Store genetic markers - map to actual database schema
    const markersToInsert = extractedData.snps.map(snp => {
      // Map status to risk_level (normal, moderate, high)
      let risk_level = 'normal';
      const statusLower = snp.status?.toLowerCase() || '';
      if (statusLower.includes('homozygous') || statusLower.includes('+/+')) {
        risk_level = 'high';
      } else if (statusLower.includes('heterozygous') || statusLower.includes('+/-')) {
        risk_level = 'moderate';
      }

      return {
        user_id: userId,
        file_id: fileId,
        snp_id: snp.rs_id, // rs_id → snp_id
        gene: snp.gene,
        genotype: snp.genotype,
        risk_level,
        clinical_significance: snp.clinical_significance || snp.notes || null,
        supplement_implications: snp.supplement_implications || null,
      };
    });

    console.log(`📊 Inserting ${markersToInsert.length} genetic markers`);
    console.log(`📋 First marker sample:`, JSON.stringify(markersToInsert[0], null, 2));

    // Use RPC function to bypass PostgREST schema cache issues
    const { data: rpcResult, error: insertError } = await supabase.rpc('insert_genetic_markers', {
      p_user_id: userId,
      p_file_id: fileId,
      p_markers: markersToInsert.map(m => ({
        snp_id: m.snp_id,
        gene: m.gene,
        genotype: m.genotype,
        risk_level: m.risk_level,
        clinical_significance: m.clinical_significance,
        supplement_implications: m.supplement_implications,
      }))
    });

    if (insertError) {
      console.error('❌ RPC error:', insertError);
      return { success: false, error: `Failed to store genetic markers: ${insertError.message}` };
    }

    if (rpcResult && !rpcResult.success) {
      console.error('❌ Function error:', rpcResult.error);
      return { success: false, error: `Failed to store genetic markers: ${rpcResult.error}` };
    }

    console.log(`✅ Successfully inserted ${markersToInsert.length} genetic markers via RPC`);

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
