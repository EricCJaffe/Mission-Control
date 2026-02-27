import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { callOpenAI } from '@/lib/openai';

export const dynamic = 'force-dynamic';

/**
 * POST /api/fitness/medications/supplement-search
 *
 * Searches the web for supplement information and extracts ingredients.
 * Used for complex supplements like "cortisol manager" or multivitamins.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { supplementName } = body;

    if (!supplementName) {
      return NextResponse.json({ ok: false, error: 'Supplement name required' }, { status: 400 });
    }

    // Use WebSearch to find supplement info
    const searchQuery = `${supplementName} supplement ingredients label facts`;

    // For now, we'll use AI to help parse common supplement types
    // In a future enhancement, we can integrate actual web search
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const systemPrompt = `You are a supplement research assistant. When given a supplement name, provide detailed information about its typical ingredients and dosages.

Return your response in JSON format:
{
  "supplement_name": "Official product name",
  "category": "e.g., Multivitamin, Stress Support, Sleep Aid, etc.",
  "common_ingredients": [
    {
      "name": "Ingredient name",
      "dosage": "Typical dosage with unit",
      "purpose": "What this ingredient does"
    }
  ],
  "brands": ["Brand 1", "Brand 2"],
  "notes": "Any important notes about formulation variations"
}`;

    const userPrompt = `Research the supplement: "${supplementName}"

Provide detailed information about this supplement's typical ingredients. If it's a blend (like "cortisol manager"), list the common ingredients found in products with this name. If it's a standard supplement (like "Vitamin D3"), provide standard dosing information.`;

    const aiResponse = await callOpenAI({
      model,
      system: systemPrompt,
      user: userPrompt,
    });

    let searchResult;
    try {
      // Try to extract JSON from response
      const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/) || aiResponse.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : aiResponse;
      searchResult = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse search result:', aiResponse);
      searchResult = {
        supplement_name: supplementName,
        category: 'Unknown',
        common_ingredients: [],
        brands: [],
        notes: aiResponse.substring(0, 500),
      };
    }

    return NextResponse.json({
      ok: true,
      result: searchResult,
    });
  } catch (error) {
    console.error('Error in supplement search:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to search supplement',
      },
      { status: 500 }
    );
  }
}
