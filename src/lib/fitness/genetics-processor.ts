// Unified Genetics Report Processor
// Handles 6 genetic report types with type-specific extraction + deep AI analysis.
// All results are saved to analysis_json on health_file_uploads via RPC.

import { supabaseServer } from '@/lib/supabase/server';
import { buildAISystemPrompt } from './health-context';
import { extractText } from 'unpdf';
import {
  GENETIC_REPORT_LABELS,
  type GeneticReportType,
} from './genetic-report-types';

// ─── Extraction prompts per report type ──────────────────────────────────────

const EXTRACTION_PROMPTS: Record<GeneticReportType, string> = {
  methylation_report: `Extract ALL SNP/variant data from this methylation/genetic report.
Focus on: MTHFR (C677T, A1298C), COMT (V158M), CBS (C699T), VDR, MTR, MTRR, AHCY, MAO-A, APOE, Factor V Leiden.

For each SNP return:
- gene, variant, rs_id, genotype (+/+, +/-, -/- or alleles), status (normal/heterozygous/homozygous), notes

Return ONLY this JSON:
\`\`\`json
{
  "report_type": "methylation_report",
  "snps": [{"gene":"MTHFR","variant":"C677T","rs_id":"rs1801133","genotype":"+/-","status":"heterozygous","notes":""}]
}
\`\`\``,

  genetics_neurotransmitter: `Extract neurotransmitter pathway findings from this genetic report.
Focus on: dopamine (DRD2, DRD4, DAT1, COMT, MAO-A, MAO-B), serotonin (5-HTT/SLC6A4, TPH1, TPH2, HTR2A), GABA, acetylcholine, norepinephrine pathways.

For each pathway/gene finding return:
- gene, pathway (dopamine/serotonin/GABA/etc), variant_or_rs_id, genotype_or_status, effect (increased/decreased/normal activity), clinical_impact

Return ONLY this JSON:
\`\`\`json
{
  "report_type": "genetics_neurotransmitter",
  "findings": [{"gene":"MAO-A","pathway":"serotonin/dopamine","variant_or_rs_id":"rs6323","genotype_or_status":"low activity","effect":"decreased","clinical_impact":"Slower breakdown of monoamines"}]
}
\`\`\``,

  genetics_detox: `Extract detoxification pathway findings from this genetic report.
Focus on: Phase I enzymes (CYP1A1, CYP1A2, CYP1B1, CYP2C9, CYP2D6, CYP3A4), Phase II enzymes (GSTP1, GSTM1, GSTT1, NAT2, SULT1A1, UGT), antioxidant (SOD2, CAT, GPX), NQO1, COMT.

For each enzyme/gene finding return:
- gene, phase (1/2/antioxidant), variant_or_rs_id, genotype_or_status, enzyme_activity (reduced/normal/elevated), impact

Return ONLY this JSON:
\`\`\`json
{
  "report_type": "genetics_detox",
  "findings": [{"gene":"GSTP1","phase":"2","variant_or_rs_id":"rs1695","genotype_or_status":"Ile/Val","enzyme_activity":"reduced","impact":"Reduced glutathione conjugation"}]
}
\`\`\``,

  genetics_mitochondrial: `Extract mitochondrial function and energy metabolism findings from this genetic report.
Focus on: TFAM, PGC-1α (PPARGC1A), SOD2, UCP2, UCP3, POLG, Complex I-IV genes, mtDNA haplogroup, ATP production genes, oxidative stress markers.

For each gene finding return:
- gene, function (energy_production/oxidative_stress/biogenesis/etc), variant_or_rs_id, genotype_or_status, impact_on_energy, clinical_impact

Return ONLY this JSON:
\`\`\`json
{
  "report_type": "genetics_mitochondrial",
  "findings": [{"gene":"SOD2","function":"oxidative_stress","variant_or_rs_id":"rs4880","genotype_or_status":"Val/Val","impact_on_energy":"reduced antioxidant protection","clinical_impact":"Higher oxidative stress during exercise"}]
}
\`\`\``,

  genetics_hormone: `Extract hormone and endocrine pathway findings from this genetic report.
Focus on: estrogen (CYP17A1, CYP19A1/aromatase, CYP1B1, COMT, ESR1, ESR2), testosterone (AR, SRD5A2), cortisol (CYP11B1, HSD11B1, HSD11B2, FKBP5), thyroid (DIO1, DIO2, TPO), SHBG, DHEA.

For each gene finding return:
- gene, hormone_system (estrogen/testosterone/cortisol/thyroid/etc), variant_or_rs_id, genotype_or_status, effect, clinical_impact

Return ONLY this JSON:
\`\`\`json
{
  "report_type": "genetics_hormone",
  "findings": [{"gene":"CYP19A1","hormone_system":"estrogen","variant_or_rs_id":"rs700518","genotype_or_status":"AA","effect":"increased aromatase activity","clinical_impact":"Higher estrogen conversion from testosterone"}]
}
\`\`\``,

  genetics_nutrition: `Extract nutritional genomics findings from this genetic report.
Focus on: Vitamin D (VDR Taq/BsmI/FokI, GC/VDBP), B12/folate (MTHFR, MTR, TCN2, FUT2), omega-3 (FADS1, FADS2), iron (HFE, TMPRSS6), calcium, magnesium, antioxidants (SOD2, CAT), caffeine (CYP1A2), lactose/gluten sensitivity.

For each nutrient/gene finding return:
- gene, nutrient_system (vitamin_d/b_vitamins/omega_3/iron/etc), variant_or_rs_id, genotype_or_status, absorption_or_metabolism (reduced/normal/elevated), clinical_impact

Return ONLY this JSON:
\`\`\`json
{
  "report_type": "genetics_nutrition",
  "findings": [{"gene":"VDR","nutrient_system":"vitamin_d","variant_or_rs_id":"rs731236","genotype_or_status":"TT","absorption_or_metabolism":"reduced","clinical_impact":"Lower Vitamin D receptor efficiency"}]
}
\`\`\``,
};

// ─── Analysis prompts per report type ────────────────────────────────────────

function buildAnalysisPrompt(reportType: GeneticReportType, extractedData: Record<string, unknown>, reportTypeName: string): string {
  const dataStr = JSON.stringify(extractedData, null, 2);

  const typeContext: Record<GeneticReportType, string> = {
    methylation_report: `methylation and SNP (Single Nucleotide Polymorphism) data. Focus on how these variants affect the methylation cycle, folate metabolism, homocysteine levels, and cardiovascular risk.`,
    genetics_neurotransmitter: `neurotransmitter genetics. Focus on how these variants affect dopamine, serotonin, GABA, and other brain chemical pathways — and what this means for mood, stress response, motivation, and cognitive function.`,
    genetics_detox: `detoxification genetics. Focus on how these variants affect Phase I and Phase II detox enzymes — and what this means for the body's ability to process environmental toxins, medications, and metabolic waste.`,
    genetics_mitochondrial: `mitochondrial function genetics. Focus on how these variants affect energy production, oxidative stress, and cellular resilience — and what this means for exercise tolerance, recovery, and fatigue.`,
    genetics_hormone: `hormone and endocrine genetics. Focus on how these variants affect estrogen, testosterone, cortisol, and thyroid pathways — and what this means for energy, mood, body composition, and cardiovascular health.`,
    genetics_nutrition: `nutritional genomics. Focus on how these variants affect nutrient absorption, metabolism, and utilization — and what specific dietary and supplement adjustments are most important.`,
  };

  return `You are a clinical genetics consultant explaining ${typeContext[reportType]}

The patient has a documented cardiac history. Explain everything in plain English that an informed non-scientist can understand. Be thorough, specific, and highly actionable.

**Extracted Report Data:**
${dataStr}

Return a COMPREHENSIVE analysis as JSON. Every field should be substantive — no placeholders, no generic advice. Reference the specific genes from the report data.

\`\`\`json
{
  "report_type": "${reportType}",
  "report_type_label": "${reportTypeName}",
  "what_this_report_covers": "2-3 sentences explaining what this type of panel measures and why it matters for overall health.",
  "summary": "A 4-6 sentence executive overview of the most important findings from THIS report. Be specific about which genes are affected and what that means practically. Highlight the 2-3 most actionable findings.",
  "key_findings": [
    {
      "finding": "Concise name of the finding, e.g. 'Reduced SOD2 Antioxidant Activity'",
      "severity": "high|moderate|low",
      "plain_english": "What this means in everyday terms — 2-3 sentences. Explain the biology simply."
    }
  ],
  "gene_explanations": [
    {
      "gene": "Gene name",
      "variant": "Variant or rs ID if known",
      "genotype": "The patient's genotype",
      "risk_level": "high|moderate|normal",
      "what_it_means": "Plain English explanation: what this gene does normally, and what the patient's variant means for their health. 3-4 sentences. Make it concrete.",
      "action_items": ["Specific, actionable step the patient can take", "Another specific step"]
    }
  ],
  "supplement_recommendations": [
    {
      "supplement": "Specific supplement name",
      "reason": "Exactly why this supplement matters for THIS patient's specific variants. Reference the gene.",
      "dosage": "Specific dose range",
      "priority": "high|medium|low",
      "caution": "Any caution notes, interactions, or things to watch for"
    }
  ],
  "dietary_recommendations": [
    {
      "area": "Category name e.g. 'Antioxidant-Rich Foods'",
      "recommendation": "Specific dietary guidance for this patient's genetic profile",
      "foods": ["specific food 1", "specific food 2"],
      "avoid": ["food or substance to limit", "another thing to avoid"],
      "priority": "high|medium|low"
    }
  ],
  "lifestyle_recommendations": [
    {
      "area": "Category e.g. 'Exercise Type'",
      "recommendation": "Specific, actionable lifestyle recommendation tied to this patient's variants",
      "priority": "high|medium|low"
    }
  ],
  "medication_notes": [
    {
      "medication_or_class": "Specific medication name or drug class",
      "note": "How this patient's genetic profile affects response to or interaction with this medication. Be specific about which gene and why.",
      "discuss_with_doctor": true
    }
  ],
  "cardiac_relevance": "3-5 sentences specifically about how these findings relate to cardiovascular health, exercise, blood pressure, and cardiac risk. Reference specific genes. Be direct about implications.",
  "things_to_discuss_with_doctor": [
    "Specific item to raise at next appointment with enough context for the doctor",
    "Another specific item"
  ]
}
\`\`\`

Be thorough and specific. Return ONLY the JSON.`;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function processGeneticReport(params: {
  userId: string;
  fileId: string;
  filePath: string;
  reportType: GeneticReportType;
}): Promise<{ success: boolean; error?: string }> {
  const { userId, fileId, filePath, reportType } = params;

  try {
    const supabase = await supabaseServer();

    // Download PDF from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('health-files')
      .download(filePath);

    if (downloadError || !fileData) {
      return { success: false, error: 'Failed to download file from storage' };
    }

    // Extract PDF text
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    console.log(`📄 Extracting text from ${reportType} (${uint8Array.length} bytes)`);

    let pdfText = '';
    try {
      const result = await extractText(uint8Array);
      pdfText = Array.isArray(result.text) ? result.text.join('\n\n') : (result.text || '');
      if (!pdfText || pdfText.trim().length === 0) {
        return { success: false, error: 'PDF is empty or a scanned image — no text could be extracted' };
      }
      console.log(`✅ Extracted ${pdfText.length} characters from ${reportType}`);
    } catch (pdfError) {
      console.error('PDF parsing error:', pdfError);
      return { success: false, error: 'Failed to parse PDF file' };
    }

    // Step 1: Extract structured data from PDF
    const extractionPrompt = EXTRACTION_PROMPTS[reportType] + `\n\n---PDF TEXT---\n${pdfText.slice(0, 60000)}\n---END PDF TEXT---`;

    const extractionResp = await callOpenAI(extractionPrompt, 3000);
    if (!extractionResp.ok) {
      return { success: false, error: `OpenAI extraction error: ${extractionResp.error}` };
    }
    const extractedData = extractionResp.data as Record<string, unknown>;
    console.log(`✅ Extracted structured data for ${reportType}`);

    // For methylation_report: also insert genetic markers into genetic_markers table
    if (reportType === 'methylation_report' && extractedData.snps) {
      await insertGeneticMarkers(userId, fileId, extractedData.snps as Record<string, unknown>[], supabase);
    }

    // Step 2: Generate deep AI analysis
    const systemPrompt = await buildAISystemPrompt(userId, 'genetics_analysis');
    const analysisPrompt = buildAnalysisPrompt(reportType, extractedData, GENETIC_REPORT_LABELS[reportType]);

    const analysisResp = await callOpenAI(analysisPrompt, 4000, systemPrompt);
    if (!analysisResp.ok) {
      console.error('Analysis generation failed (non-critical, extraction saved):', analysisResp.error);
    }

    const analysis = analysisResp.ok ? analysisResp.data : buildFallbackAnalysis(reportType, extractedData);

    // Attach extracted data to analysis for reference
    const fullAnalysis = {
      ...analysis,
      extracted_data: extractedData,
      generated_at: new Date().toISOString(),
    };

    // Save analysis via RPC
    const { error: saveError } = await supabase.rpc('update_file_upload_analysis', {
      p_file_id: fileId,
      p_user_id: userId,
      p_analysis: fullAnalysis,
    });

    if (saveError) {
      console.error('Failed to save analysis via RPC:', saveError);
    } else {
      console.log(`✅ Analysis saved for ${reportType}`);
    }

    return { success: true };

  } catch (error) {
    console.error(`${reportType} processing error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ─── Re-generate analysis for a single file (refresh) ─────────────────────────

export async function refreshGeneticAnalysis(params: {
  userId: string;
  fileId: string;
  reportType: GeneticReportType;
}): Promise<{ success: boolean; analysis?: Record<string, unknown>; error?: string }> {
  const { userId, fileId, reportType } = params;

  try {
    const supabase = await supabaseServer();

    // Load previously extracted data from analysis_json
    const { data: existingResult } = await supabase.rpc('get_file_upload_analysis', {
      p_file_id: fileId,
      p_user_id: userId,
    });

    const existingAnalysis = existingResult?.analysis as Record<string, unknown> | null;
    const extractedData = (existingAnalysis?.extracted_data as Record<string, unknown>) || {};

    // If no extracted data, fall back to genetic_markers (methylation only)
    let dataForAnalysis = extractedData;
    if (Object.keys(extractedData).length === 0 && reportType === 'methylation_report') {
      const { data: markers } = await supabase
        .from('genetic_markers')
        .select('*')
        .eq('file_id', fileId)
        .eq('user_id', userId);
      if (markers && markers.length > 0) {
        dataForAnalysis = { report_type: 'methylation_report', snps: markers };
      }
    }

    const systemPrompt = await buildAISystemPrompt(userId, 'genetics_analysis');
    const analysisPrompt = buildAnalysisPrompt(reportType, dataForAnalysis, GENETIC_REPORT_LABELS[reportType]);

    const analysisResp = await callOpenAI(analysisPrompt, 4000, systemPrompt);
    if (!analysisResp.ok) {
      return { success: false, error: analysisResp.error };
    }

    const newAnalysis = {
      ...analysisResp.data,
      extracted_data: dataForAnalysis,
      generated_at: new Date().toISOString(),
    };

    await supabase.rpc('update_file_upload_analysis', {
      p_file_id: fileId,
      p_user_id: userId,
      p_analysis: newAnalysis,
    });

    return { success: true, analysis: newAnalysis as Record<string, unknown> };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function callOpenAI(
  userPrompt: string,
  maxTokens: number,
  systemPrompt?: string
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    return { ok: false, error: `OpenAI API error: ${response.status}` };
  }

  const aiResponse = await response.json();
  const content = aiResponse.choices?.[0]?.message?.content;
  if (!content) return { ok: false, error: 'No content returned from OpenAI' };

  try {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : content;
    return { ok: true, data: JSON.parse(jsonText) };
  } catch {
    return { ok: false, error: 'Failed to parse OpenAI response as JSON' };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function insertGeneticMarkers(userId: string, fileId: string, snps: Record<string, unknown>[], supabase: any) {
  const markers = snps.map((snp) => {
    const statusLower = String(snp.status || '').toLowerCase();
    let risk_level = 'normal';
    if (statusLower.includes('homozygous') || statusLower.includes('+/+')) risk_level = 'high';
    else if (statusLower.includes('heterozygous') || statusLower.includes('+/-')) risk_level = 'moderate';
    return {
      snp_id: snp.rs_id || snp.variant,
      gene: snp.gene,
      genotype: snp.genotype,
      risk_level,
      clinical_significance: snp.clinical_significance || snp.notes || null,
      supplement_implications: snp.supplement_implications || null,
    };
  });

  const { error } = await supabase.rpc('insert_genetic_markers', {
    p_user_id: userId,
    p_file_id: fileId,
    p_markers: markers,
  });

  if (error) {
    console.error('Failed to insert genetic markers:', error);
  } else {
    console.log(`✅ Inserted ${markers.length} genetic markers`);
  }
}

function buildFallbackAnalysis(reportType: GeneticReportType, extractedData: Record<string, unknown>): Record<string, unknown> {
  const findings = (extractedData.findings as Record<string, unknown>[] || extractedData.snps as Record<string, unknown>[] || []);
  return {
    report_type: reportType,
    report_type_label: GENETIC_REPORT_LABELS[reportType],
    what_this_report_covers: `This report analyzes genetic variants relevant to ${GENETIC_REPORT_LABELS[reportType].toLowerCase()}.`,
    summary: `Found ${findings.length} genetic findings in this ${GENETIC_REPORT_LABELS[reportType]} report. Full AI analysis could not be generated — please use the Refresh button to retry.`,
    key_findings: [],
    gene_explanations: [],
    supplement_recommendations: [],
    dietary_recommendations: [],
    lifestyle_recommendations: [],
    medication_notes: [],
    cardiac_relevance: 'Analysis unavailable. Please refresh to generate AI analysis.',
    things_to_discuss_with_doctor: [],
    extracted_data: extractedData,
    generated_at: new Date().toISOString(),
  };
}
