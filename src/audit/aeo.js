import { check } from './check.js';
import { isQuestion, splitSentences } from '../extract.js';

const SUMMARY_CUES = /\b(tl;?dr|key takeaways?|in short|at a glance|summary|quick answer|the short answer)\b/i;
const DEFINITION = /\b(is|are|refers to|means|stands for)\b/i;
const STEP_CUES = /\b(step\s?\d|first,|then,|finally,|how to)\b/i;

/**
 * AEO — Answer Engine Optimization.
 * Can a machine lift a correct, self-contained answer off this page?
 */
export function auditAeo(page) {
  const c = [];
  const qHeadings = page.headings.filter((h) => h.level >= 2 && isQuestion(h.text));
  const answered = qHeadings.filter((h) => {
    if (!h.answer) return false;
    const words = h.answer.split(/\s+/).length;
    return words >= 15;
  });

  // --- FAQ / QA schema -----------------------------------------------------
  const hasFaq = page.jsonLdTypes.some((t) => /FAQPage|QAPage/i.test(t));
  c.push(
    check({
      id: 'aeo.faq-schema',
      category: 'aeo',
      title: 'FAQ / Q&A structured data',
      weight: 10,
      impact: 'high',
      status: hasFaq ? 'pass' : qHeadings.length >= 2 ? 'fail' : 'warn',
      found: hasFaq
        ? 'FAQPage/QAPage schema found'
        : `No FAQ schema${qHeadings.length ? ` — but ${qHeadings.length} question headings are already on the page` : ''}`,
      fix: 'FAQPage markup is the single highest-leverage AEO win: it hands answer engines pre-paired Q&A. Generate it in the Generate tab.',
      evidence: qHeadings.slice(0, 5).map((h) => h.text),
    }),
  );

  // --- Question headings ---------------------------------------------------
  const expected = page.wordCount > 1200 ? 4 : page.wordCount > 500 ? 2 : 1;
  c.push(
    check({
      id: 'aeo.question-headings',
      category: 'aeo',
      title: 'Questions used as headings',
      weight: 8,
      impact: 'high',
      status: qHeadings.length >= expected ? 'pass' : qHeadings.length ? 'warn' : 'fail',
      found: `${qHeadings.length} question-style H2/H3 (target ≥ ${expected} for ${page.wordCount} words)`,
      fix: 'Phrase sub-headings exactly as users ask them. Answer engines match the query to the heading, then lift the block below it.',
      evidence: qHeadings.slice(0, 6).map((h) => h.text),
    }),
  );

  // --- Answer directly under each question ---------------------------------
  c.push(
    check({
      id: 'aeo.answer-blocks',
      category: 'aeo',
      title: 'Direct answer under each question',
      weight: 9,
      impact: 'high',
      status: !qHeadings.length
        ? 'warn'
        : answered.length === qHeadings.length
          ? 'pass'
          : answered.length
            ? 'warn'
            : 'fail',
      found: qHeadings.length
        ? `${answered.length}/${qHeadings.length} question headings are followed by a substantive block`
        : 'No question headings to evaluate',
      fix: 'Put a 40–60 word standalone answer immediately after the question — no preamble, no "as we discussed above".',
      evidence: qHeadings.filter((h) => !answered.includes(h)).slice(0, 4).map((h) => h.text),
    }),
  );

  // --- Answer-first opening ------------------------------------------------
  const lead = page.firstParagraph || '';
  const leadWords = lead ? lead.split(/\s+/).length : 0;
  c.push(
    check({
      id: 'aeo.answer-first',
      category: 'aeo',
      title: 'Answer-first opening paragraph',
      weight: 8,
      impact: 'high',
      status: !lead ? 'fail' : leadWords <= 70 && DEFINITION.test(lead) ? 'pass' : 'warn',
      found: lead ? `${leadWords} words · ${DEFINITION.test(lead) ? 'contains a definition clause' : 'no definition clause'}` : 'No opening paragraph found',
      fix: 'Open with the answer in one or two sentences ("X is …"), then expand. Snippet extractors read the first block hardest.',
      evidence: lead ? [lead.slice(0, 220)] : [],
    }),
  );

  // --- Summary block -------------------------------------------------------
  const hasSummary = SUMMARY_CUES.test(page.text.slice(0, 2500));
  c.push(
    check({
      id: 'aeo.summary-block',
      category: 'aeo',
      title: 'TL;DR / key takeaways block',
      weight: 6,
      impact: 'medium',
      status: hasSummary ? 'pass' : page.wordCount > 700 ? 'fail' : 'warn',
      found: hasSummary ? 'Summary cue found near the top' : 'No TL;DR or key-takeaways block',
      fix: 'Add a 3–5 bullet "Key takeaways" box above the fold. It is the block LLMs quote most often.',
    }),
  );

  // --- Snippet formats -----------------------------------------------------
  const formatScore = (page.lists ? 1 : 0) + (page.tables ? 1 : 0) + (page.listItems >= 6 ? 1 : 0);
  c.push(
    check({
      id: 'aeo.snippet-formats',
      category: 'aeo',
      title: 'Snippet-friendly formats',
      weight: 7,
      impact: 'high',
      status: formatScore >= 2 ? 'pass' : formatScore === 1 ? 'warn' : 'fail',
      found: `${page.lists} list(s) with ${page.listItems} items · ${page.tables} table(s) · ${page.dl} definition list(s)`,
      fix: 'Lists and comparison tables win list- and table-type snippets outright, and LLMs reproduce them nearly verbatim.',
    }),
  );

  // --- Readability ---------------------------------------------------------
  const r = page.readability;
  c.push(
    check({
      id: 'aeo.readability',
      category: 'aeo',
      title: 'Sentence-level readability',
      weight: 6,
      impact: 'medium',
      status: r.flesch == null ? 'warn' : r.flesch >= 50 && r.avgSentenceWords <= 22 ? 'pass' : r.flesch >= 35 ? 'warn' : 'fail',
      found: r.flesch == null ? 'Not enough text to measure' : `Flesch ${r.flesch} · grade ${r.grade} · ${r.avgSentenceWords} words/sentence`,
      fix: 'Target Flesch 50–70 and under 22 words per sentence. Long sentences are hard to extract as clean answers.',
    }),
  );

  // --- Paragraph chunking --------------------------------------------------
  const paraWords = page.paragraphs.map((p) => p.split(/\s+/).length);
  const avgPara = paraWords.length ? Math.round(paraWords.reduce((a, b) => a + b, 0) / paraWords.length) : 0;
  const longParas = paraWords.filter((w) => w > 120).length;
  c.push(
    check({
      id: 'aeo.paragraph-size',
      category: 'aeo',
      title: 'Paragraph chunking',
      weight: 5,
      impact: 'medium',
      status: !paraWords.length ? 'fail' : avgPara <= 90 && longParas <= 1 ? 'pass' : 'warn',
      found: paraWords.length ? `${paraWords.length} paragraphs · ${avgPara} words average · ${longParas} over 120 words` : 'No paragraphs detected',
      fix: 'Keep paragraphs to 2–4 sentences so each one survives as a self-contained retrieval chunk.',
    }),
  );

  // --- Semantic HTML -------------------------------------------------------
  const s = page.semantics;
  const semanticCount = [s.main, s.article, s.header, s.footer, s.nav].filter(Boolean).length;
  c.push(
    check({
      id: 'aeo.semantic-html',
      category: 'aeo',
      title: 'Semantic HTML landmarks',
      weight: 5,
      impact: 'medium',
      status: s.main && semanticCount >= 3 ? 'pass' : semanticCount >= 2 ? 'warn' : 'fail',
      found: `${['main', 'article', 'section', 'nav', 'header', 'footer'].filter((k) => s[k]).join(', ') || 'none'}`,
      fix: 'Wrap the answer body in <main><article>. Parsers use landmarks to separate content from chrome.',
    }),
  );

  // --- Anchors / TOC -------------------------------------------------------
  const h2h3 = page.headings.filter((h) => h.level === 2 || h.level === 3).length;
  const anchorCoverage = h2h3 ? Math.round((page.anchoredHeadings / h2h3) * 100) : 0;
  c.push(
    check({
      id: 'aeo.anchors',
      category: 'aeo',
      title: 'Anchored headings & jump links',
      weight: 5,
      impact: 'medium',
      status: h2h3 === 0 ? 'warn' : anchorCoverage >= 80 ? 'pass' : anchorCoverage >= 40 ? 'warn' : 'fail',
      found: `${page.anchoredHeadings}/${h2h3} section headings have an id · ${page.tocLinks} in-page links`,
      fix: 'Give every H2/H3 a stable id. Google links straight to #fragments in AI Overviews and "jump to" results.',
    }),
  );

  // --- Speakable -----------------------------------------------------------
  c.push(
    check({
      id: 'aeo.speakable',
      category: 'aeo',
      title: 'Speakable markup (voice)',
      weight: 3,
      impact: 'low',
      status: page.jsonLd.some((n) => JSON.stringify(n).includes('speakable')) ? 'pass' : 'warn',
      found: page.jsonLd.some((n) => JSON.stringify(n).includes('speakable')) ? 'speakable property present' : 'No speakable property',
      fix: 'Mark the summary section as speakable so voice assistants know which sentences to read aloud.',
    }),
  );

  // --- HowTo opportunity ---------------------------------------------------
  const looksHowTo = STEP_CUES.test(page.title || '') || STEP_CUES.test(page.text.slice(0, 3000));
  const hasHowTo = page.jsonLdTypes.some((t) => /HowTo/i.test(t));
  if (looksHowTo) {
    c.push(
      check({
        id: 'aeo.howto',
        category: 'aeo',
        title: 'HowTo structured data',
        weight: 4,
        impact: 'medium',
        status: hasHowTo ? 'pass' : 'fail',
        found: hasHowTo ? 'HowTo schema present' : 'Procedural content detected, but no HowTo schema',
        fix: 'Mark up numbered steps with HowTo so assistants can walk a user through them turn by turn.',
      }),
    );
  }

  // --- Self-contained sentences -------------------------------------------
  const sentences = splitSentences(page.text).slice(0, 40);
  const pronounStarts = sentences.filter((s) => /^(it|this|that|they|these|those|he|she)\b/i.test(s)).length;
  c.push(
    check({
      id: 'aeo.context-free',
      category: 'aeo',
      title: 'Context-free sentences',
      weight: 4,
      impact: 'medium',
      status: !sentences.length ? 'warn' : pronounStarts <= 3 ? 'pass' : pronounStarts <= 7 ? 'warn' : 'fail',
      found: `${pronounStarts} of the first ${sentences.length} sentences start with a bare pronoun`,
      fix: 'Name the subject instead of "it" or "this". Extracted sentences lose their antecedent and read as nonsense.',
    }),
  );

  return c;
}
