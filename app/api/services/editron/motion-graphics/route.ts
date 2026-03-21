/**
 * Motion Graphics Template API
 *
 * GET  — list templates, optionally filtered by category/style
 * POST — search by natural language query + AI slot-fill
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  getAllTemplates,
  searchTemplates,
  getTemplateById,
  fillTemplateSlots,
  fillTemplateWithDefaults,
  computeRelevanceScore,
} from '@/lib/editron/services/motion-graphics-service';

// ── GET: List / filter templates ──────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') as any;
    const style = searchParams.get('style') as any;
    const templateId = searchParams.get('id');

    // Single template by ID
    if (templateId) {
      const template = await getTemplateById(templateId);
      if (!template) {
        return NextResponse.json(
          { error: 'Template not found' },
          { status: 404 },
        );
      }
      return NextResponse.json({ template });
    }

    // List with optional filters
    const filters: Record<string, any> = {};
    if (category) filters.category = category;
    if (style) filters.style = style;

    const templates = await getAllTemplates(
      Object.keys(filters).length > 0 ? filters : undefined,
    );

    return NextResponse.json({
      count: templates.length,
      templates: templates.map((t) => ({
        templateId: t.templateId,
        name: t.name,
        category: t.category,
        style: t.style,
        tags: t.tags,
        slots: t.slots,
        defaultDuration: t.defaultDuration,
        dimensions: t.dimensions,
      })),
    });
  } catch (err: any) {
    console.error('[motion-graphics API] GET error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch templates', details: err.message },
      { status: 500 },
    );
  }
}

// ── POST: Search + AI slot-fill ───────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, context, templateId, slotOverrides } = body as {
      query?: string;
      context?: string;
      templateId?: string;  // Optional: directly use a specific template
      slotOverrides?: Record<string, string>;  // Optional: manual slot values
    };

    if (!query && !templateId) {
      return NextResponse.json(
        { error: 'Either "query" or "templateId" is required.' },
        { status: 400 },
      );
    }

    let selectedTemplate;
    let score = 1;

    if (templateId) {
      // Direct template selection
      selectedTemplate = await getTemplateById(templateId);
      if (!selectedTemplate) {
        return NextResponse.json(
          { error: `Template "${templateId}" not found.` },
          { status: 404 },
        );
      }
    } else {
      // Search by query
      const candidates = await searchTemplates(query!, 5);
      if (candidates.length === 0) {
        return NextResponse.json({
          matched: false,
          message: 'No templates matched the query. Use Gemini HTML generation as fallback.',
          candidates: [],
        });
      }

      // Score candidates
      const scored = candidates.map((t) => ({
        template: t,
        score: computeRelevanceScore(query!, t),
      }));
      scored.sort((a, b) => b.score - a.score);

      selectedTemplate = scored[0].template;
      score = scored[0].score;

      // If best score is below threshold, return candidates but suggest fallback
      if (score < 0.3) {
        return NextResponse.json({
          matched: false,
          message: 'No strong template match. Consider Gemini generation.',
          candidates: scored.slice(0, 3).map((s) => ({
            templateId: s.template.templateId,
            name: s.template.name,
            category: s.template.category,
            score: Math.round(s.score * 100) / 100,
          })),
        });
      }
    }

    // Fill slots
    let filledHtml: string;
    if (slotOverrides && Object.keys(slotOverrides).length > 0) {
      // Manual overrides — fill directly without AI
      let html = selectedTemplate.htmlTemplate;
      for (const slot of selectedTemplate.slots) {
        const value = slotOverrides[slot.name] ?? slot.default;
        html = html.replace(new RegExp(`\\{\\{${slot.name}\\}\\}`, 'g'), String(value));
      }
      filledHtml = html;
    } else if (query) {
      // AI slot-fill
      filledHtml = await fillTemplateSlots(selectedTemplate, query, context);
    } else {
      filledHtml = fillTemplateWithDefaults(selectedTemplate);
    }

    return NextResponse.json({
      matched: true,
      score: Math.round(score * 100) / 100,
      template: {
        templateId: selectedTemplate.templateId,
        name: selectedTemplate.name,
        category: selectedTemplate.category,
        style: selectedTemplate.style,
        defaultDuration: selectedTemplate.defaultDuration,
        dimensions: selectedTemplate.dimensions,
      },
      filledHtml,
    });
  } catch (err: any) {
    console.error('[motion-graphics API] POST error:', err);
    return NextResponse.json(
      { error: 'Failed to process template request', details: err.message },
      { status: 500 },
    );
  }
}
