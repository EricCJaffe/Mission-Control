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

    // Store genetic markers via RPC function (bypasses PostgREST schema cache)
    const markersForRpc = extractedData.snps.map(snp => {
      // Map status to risk_level (normal, moderate, high)
      let risk_level = 'normal';
      const statusLower = snp.status?.toLowerCase() || '';
      if (statusLower.includes('homozygous') || statusLower.includes('+/+')) {
        risk_level = 'high';
      } else if (statusLower.includes('heterozygous') || statusLower.includes('+/-')) {
        risk_level = 'moderate';
      }

      return {
        snp_id: snp.rs_id,
        gene: snp.gene,
        genotype: snp.genotype,
        risk_level,
        clinical_significance: snp.clinical_significance || snp.notes || null,
        supplement_implications: snp.supplement_implications || null,
      };
    });

    console.log(`📊 Inserting ${markersForRpc.length} genetic markers via RPC`);
    console.log(`📋 First marker sample:`, JSON.stringify(markersForRpc[0], null, 2));

    // Use SECURITY DEFINER RPC function to bypass PostgREST schema cache issue
    const { data: rpcResult, error: rpcError } = await supabase.rpc('insert_genetic_markers', {
      p_user_id: userId,
      p_file_id: fileId,
      p_markers: markersForRpc,
    });

    if (rpcError) {
      console.error('❌ RPC error:', rpcError);
      return { success: false, error: `Failed to store genetic markers: ${rpcError.message}` };
    }

    // The RPC returns { success: bool, count: int } or { success: false, error: string }
    if (rpcResult && !rpcResult.success) {
      console.error('❌ RPC function error:', rpcResult.error);
      return { success: false, error: `Failed to store genetic markers: ${rpcResult.error}` };
    }

    console.log(`✅ Successfully inserted ${rpcResult?.count || markersForRpc.length} genetic markers`);

    // Generate implications using AI with health context (non-blocking)
    try {
      await generateMethylationAnalysis({ userId, fileId });
    } catch (analysisErr) {
      console.error('Methylation analysis failed (non-critical, markers saved):', analysisErr);
    }

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
            marker_count: markersForRpc.length,
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
export async function generateMethylationAnalysis(params: {
  userId: string;
  fileId: string;
}): Promise<Record<string, unknown> | null> {
  const { userId, fileId } = params;
  const supabase = await supabaseServer();

  // Load extracted SNPs
  const { data: markers } = await supabase
    .from('genetic_markers')
    .select('*')
    .eq('file_id', fileId);

  if (!markers || markers.length === 0) {
    console.error('No genetic markers found for analysis');
    return null;
  }

  // Build AI prompt with health context
  const systemPrompt = await buildAISystemPrompt(userId, 'methylation_analysis');

  const userPrompt = `You are a clinical genetics consultant explaining methylation/SNP results to an informed patient with a cardiac history. Analyze these genetic markers and provide thorough, actionable recommendations in plain English.

**SNP Data**:
${markers.map(m => `- ${m.gene} (${m.snp_id}): ${m.genotype} — risk: ${m.risk_level || 'unknown'}${m.clinical_significance ? ` — ${m.clinical_significance}` : ''}`).join('\n')}

Provide a COMPREHENSIVE analysis. For each gene variant:
- Explain what the gene does in plain English
- What the specific genotype means for this person
- What actionable steps they can take

Return JSON:
\`\`\`json
{
  "summary": "A 3-5 sentence plain-English overview of the most important findings. Explain what the results mean for daily life, not just list gene names. Highlight the 2-3 most actionable findings.",
  "gene_explanations": [
    {
      "gene": "MTHFR",
      "variant": "C677T",
      "snp_id": "rs1801133",
      "genotype": "+/-",
      "risk_level": "moderate",
      "what_it_means": "Plain English explanation of what this gene does and what this variant means for the person. 2-3 sentences. Explain the biochemistry simply — e.g. 'This gene helps convert folate into its active form. Your variant means this process works at about 65% efficiency, which can lead to higher homocysteine levels.'",
      "action_items": ["Specific actionable step 1", "Specific actionable step 2"]
    }
  ],
  "supplement_recommendations": [
    {
      "supplement": "Methylfolate (5-MTHF)",
      "reason": "Your MTHFR variant reduces folate conversion by ~35%. Methylfolate bypasses this bottleneck, helping lower homocysteine and support methylation.",
      "dosage": "400-800 mcg daily with food",
      "priority": "high",
      "caution": "Start at lower dose and increase gradually. Avoid folic acid (synthetic) in supplements."
    }
  ],
  "lifestyle_recommendations": [
    {
      "area": "Exercise",
      "recommendation": "Detailed, specific recommendation based on genetic profile. Reference the specific genes driving this recommendation.",
      "priority": "high"
    }
  ],
  "medication_notes": [
    {
      "medication": "Medication name",
      "note": "How this genetic profile interacts with this medication. Be specific about which variant matters and why."
    }
  ],
  "dietary_recommendations": [
    {
      "area": "Folate-Rich Foods",
      "recommendation": "Specific dietary guidance based on genetic profile",
      "foods": ["dark leafy greens", "lentils", "avocado"],
      "priority": "high"
    }
  ],
  "cardiac_relevance": "Detailed 3-5 sentence summary of how these SNPs specifically affect cardiovascular health, exercise tolerance, recovery, and blood pressure management. Reference specific genes and their cardiac implications.",
  "things_to_discuss_with_doctor": ["Specific item to bring up at next appointment", "Another item"]
}
\`\`\`

Be thorough, specific, and actionable. Explain things a smart non-scientist would understand. Return ONLY the JSON.`;

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
        max_tokens: 4000,
      }),
    });

    const aiResponse = await response.json();
    const analysisText = aiResponse.choices[0]?.message?.content;

    const jsonMatch = analysisText.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : analysisText;
    const analysis = JSON.parse(jsonText);

    console.log(`✅ Methylation analysis complete:`, JSON.stringify({
      summary: analysis.summary?.substring(0, 100),
      supplement_count: analysis.supplement_recommendations?.length || 0,
      lifestyle_count: analysis.lifestyle_recommendations?.length || 0,
    }));

    return analysis;

  } catch (error) {
    console.error('Methylation analysis error:', error);
    return null;
  }
}
