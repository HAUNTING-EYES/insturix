"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
  Svg,
  Path,
  Circle,
  Line,
} from "@react-pdf/renderer";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

interface MetricData {
  score?: number;
  description: string;
}

interface CreatorFeedback {
  strengths?: string[];
  improvements?: string[];
}

interface AnalysisData {
  category?: string;
  overall_score?: number;
  overview?: string;
  remarks?: string;
  titles?: string[];
  descriptions?: string[];
  target_audience?: string;
  creator_feedback?: CreatorFeedback;
  [key: string]: unknown;
}

interface ExportPDFButtonProps {
  analysisData: AnalysisData;
  videoTitle?: string;
  filename?: string;
}

// Color tokens (match the UI exactly)
const C = {
  pageBg: "#09090b",
  cardBg: "#18181b",
  cardBorder: "#27272a",
  innerBg: "#00000033",
  text100: "#f4f4f5",
  text200: "#e4e4e7",
  text300: "#d4d4d8",
  text400: "#a1a1aa",
  text500: "#71717a",
  blue400: "#60a5fa",
  blue300: "#93c5fd",
  blueCardBg: "#0c1a2e",
  blueCardBorder: "#1e3a5f",
  blueInnerBg: "#080f1c",
  green400: "#4ade80",
  greenBg: "#052e16",
  yellow400: "#facc15",
  yellowBg: "#3d2000",
  red400: "#f87171",
  redBg: "#3d0a0a",
};

// Styles
const s = StyleSheet.create({
  // Page
  page: {
    backgroundColor: C.pageBg,
    paddingHorizontal: 30,
    paddingVertical: 32,
    fontFamily: "Helvetica",
  },

  // Header
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
    paddingBottom: 14,
    marginBottom: 18,
  },
  headerLeft: { flex: 1 },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: C.text100,
  },
  headerMeta: {
    fontSize: 8,
    color: C.text400,
    marginTop: 4,
  },
  headerScoreWrap: { alignItems: "flex-end" },
  headerScore: {
    fontSize: 40,
    fontFamily: "Helvetica-Bold",
    color: C.text100,
    lineHeight: 1,
  },
  headerScoreLabel: {
    fontSize: 8,
    color: C.text400,
    marginTop: 3,
  },

  // Generic card
  card: {
    backgroundColor: C.cardBg,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.text100,
    marginBottom: 8,
  },
  bodyText: {
    fontSize: 8.5,
    color: C.text300,
    lineHeight: 1.6,
  },

  // Remarks card (blue tint)
  remarksCard: {
    backgroundColor: C.blueCardBg,
    borderWidth: 1,
    borderColor: C.blueCardBorder,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  remarksHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  remarksIconBox: {
    width: 22,
    height: 22,
    backgroundColor: "#1e3a5f",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  remarksIconText: { fontSize: 11, color: C.blue400 },
  remarksTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#dbeafe",
  },
  remarksSubtitle: {
    fontSize: 7.5,
    color: C.blue300,
    marginBottom: 10,
    opacity: 0.8,
  },
  remarksInner: {
    backgroundColor: C.blueInnerBg,
    borderWidth: 1,
    borderColor: C.blueCardBorder,
    borderRadius: 6,
    padding: 10,
  },
  remarksBodyText: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: C.text200,
    lineHeight: 1.6,
  },

  // Titles / Descriptions side by side
  twoColRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  colTitles: {
    flex: 2,
    backgroundColor: C.cardBg,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 8,
    padding: 12,
  },
  colDescs: {
    flex: 3,
    backgroundColor: C.cardBg,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 8,
    padding: 12,
  },
  listItem: {
    backgroundColor: C.innerBg,
    borderRadius: 5,
    padding: 7,
    marginBottom: 5,
  },
  listItemText: {
    fontSize: 8,
    color: C.text300,
    lineHeight: 1.5,
  },
  listItemNum: {
    fontSize: 6.5,
    color: C.text500,
    marginTop: 2,
  },

  // Metric sections
  sectionLabel: {
    fontSize: 7,
    color: C.text500,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 2,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12,
  },
  // Left card in a row gets a right margin; right card fills remaining space.
  // With page width 535 (595 - 30*2 padding), each card is ~262 with 11 gap.
  metricCard: {
    width: "49%",
    backgroundColor: C.cardBg,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  metricCardLeft: {
    marginRight: "2%",
  },
  metricInnerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  metricTextWrap: { flex: 1, marginRight: 8 },
  metricKey: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: C.text200,
    marginBottom: 3,
    textTransform: "capitalize",
  },
  metricDesc: {
    fontSize: 7.5,
    color: C.text400,
    lineHeight: 1.5,
  },
  scoreBadge: {
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    minWidth: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreNum: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },

  // Creator feedback
  feedbackRow: { flexDirection: "row", gap: 10 },
  feedbackCol: { flex: 1 },
  feedbackColTitle: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: C.text300,
    marginBottom: 7,
  },
  feedbackItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.innerBg,
    borderRadius: 5,
    padding: 7,
    marginBottom: 5,
    gap: 5,
  },
  feedbackBullet: { fontSize: 9, marginTop: -0.5 },
  feedbackText: {
    fontSize: 7.5,
    color: C.text400,
    lineHeight: 1.5,
    flex: 1,
  },
});

// Helpers
function scoreColors(score: number, invert = false) {
  const eff = invert ? 100 - score : score;
  if (eff >= 80) return { bg: C.greenBg, text: C.green400 };
  if (eff >= 60) return { bg: C.yellowBg, text: C.yellow400 };
  return { bg: C.redBg, text: C.red400 };
}

const SKIP = new Set([
  "category", "creator_feedback", "overall_score",
  "overview", "titles", "descriptions", "target_audience", "remarks",
]);

const TimestampBlueText = (text: string) => {
  // Regex to match [HH:MM:SS], [MM:SS], or [H:MM:SS] format
  const timestampRegex = /\[(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})\]/g;
  
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = timestampRegex.exec(text)) !== null) {
    // Add text before the timestamp
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex, match.index),
        key: `text-${lastIndex}`
      });
    }
    
    // Add the timestamp as a clickable button
    const timestamp = match[1]; // Extract timestamp without brackets
    parts.push({
      type: 'timestamp',
      content: timestamp,
      key: `timestamp-${match.index}`
    });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text after the last timestamp
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.substring(lastIndex),
      key: `text-${lastIndex}`
    });
  }

  return (
    <>
      {parts.map((part) => {
        if (part.type === 'timestamp') {
          return (
            <Text key={part.key} style={{color: "#51a2ff"}}>
              {part.content}
            </Text>
          );
        } else {
          return <Text key={part.key}>{part.content}</Text>;
        }
      })}
    </>
  );
};

// PDF Document component
function AnalysisPDF({
  data,
  videoTitle,
}: {
  data: AnalysisData;
  videoTitle?: string;
}) {
  const score = data.overall_score ?? 0;
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const metricSections = Object.entries(data).filter(([key, val]) => {
    if (SKIP.has(key)) return false;
    if (typeof val !== "object" || val === null || Array.isArray(val)) return false;
    return Object.keys(val as object).length > 0;
  }) as [string, Record<string, MetricData>][];

  return (
    <Document title={videoTitle ?? "Analysis Report"} author="Alyzitron">
      <Page size="A4" style={s.page} wrap>

        {/* HEADER */}
        <View style={s.headerRow}> {/* add 'fixed' to make it header */}
          <View style={s.headerLeft}>
            <Text style={s.headerTitle}>Analysis Results</Text>
            <Text style={s.headerMeta}>
              {[data.category, date, videoTitle?.replace(/_/g, " ")]
                .filter(Boolean)
                .join("  •  ")}
            </Text>
          </View>
          <View style={s.headerScoreWrap}>
            <Text style={s.headerScore}>{score}</Text>
            <Text style={s.headerScoreLabel}>Overall Score</Text>
          </View>
        </View>

        {/* OVERVIEW */}
        {data.overview ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Overview</Text>
            <Text style={s.bodyText}>{data.overview}</Text>
          </View>
        ) : null}

        {/* ANALYSIS SUMMARY */}
        {data.remarks ? (
          <View style={s.remarksCard}>
            <View style={s.remarksHeaderRow}>
              <View style={s.remarksIconBox}>
                {/* <Text style={s.remarksIconText}>✓</Text> */}
                <Svg width={12} height={12} viewBox="0 0 24 24">
                  <Path d="M21.801 10A10 10 0 1 1 17 3.335" stroke="#51a2ff" strokeWidth={2} fill="none"></Path>
                  <Path d="m9 11 3 3L22 4" stroke="#51a2ff" strokeWidth={2} fill="none"></Path>
                </Svg>
              </View>
              <Text style={s.remarksTitle}>Analysis Summary</Text>
            </View>
            <Text style={s.remarksSubtitle}>
              Key insights and conclusions from the complete analysis
            </Text>
            <View style={s.remarksInner}>
              <Text style={s.remarksBodyText}>{data.remarks}</Text>
            </View>
          </View>
        ) : null}

        {/* TITLES + DESCRIPTIONS */}
        {(data.titles?.length || data.descriptions?.length) ? (
          <View style={s.twoColRow}>
            {data.titles && data.titles.length > 0 ? (
              <View style={s.colTitles}>
                <Text style={s.cardTitle}>Recommended Titles</Text>
                {data.titles.map((t, i) => (
                  <View key={i} style={s.listItem}>
                    <Text style={s.listItemText}>{t}</Text>
                    <Text style={s.listItemNum}>#{i + 1}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {data.descriptions && data.descriptions.length > 0 ? (
              <View style={s.colDescs}>
                <Text style={s.cardTitle}>Recommended Descriptions</Text>
                {data.descriptions.map((d, i) => (
                  <View key={i} style={s.listItem}>
                    <Text style={s.listItemText}>{d}</Text>
                    <Text style={s.listItemNum}>#{i + 1}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* TARGET AUDIENCE */}
        {data.target_audience ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Target Audience</Text>
            <Text style={s.bodyText}>{data.target_audience}</Text>
          </View>
        ) : null}

        {/* METRIC SECTIONS */}
        {metricSections.map(([section, metrics]) => {
          const isInverted = section === "compliance_risks";
          return (
            <View key={section}>
              <Text style={s.sectionLabel}>{section.replace(/_/g, " ")}</Text>
              <View style={s.metricsGrid}>
                {Object.entries(metrics).map(([key, value], idx) => {
                  const sc = value.score
                    ? scoreColors(value.score, isInverted)
                    : null;
                  const isLeft = idx % 2 === 0;
                  return (
                    <View key={key} style={[s.metricCard, isLeft ? s.metricCardLeft : {}]}>
                      <View style={s.metricInnerRow}>
                        <View style={s.metricTextWrap}>
                          <Text style={s.metricKey}>{key.replace(/_/g, " ")}</Text>
                          <Text style={s.metricDesc}>{TimestampBlueText(value.description)}</Text>
                        </View>
                        {sc && value.score ? (
                          <View style={[s.scoreBadge, { backgroundColor: sc.bg }]}>
                            <Text style={[s.scoreNum, { color: sc.text }]}>
                              {value.score}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}

        {/* CREATOR FEEDBACK */}
        {data.creator_feedback ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Creator Feedback</Text>
            <View style={s.feedbackRow}>
              <View style={s.feedbackCol}>
                <Text style={s.feedbackColTitle}>Strengths</Text>
                {(data.creator_feedback.strengths ?? []).map((item, i) => (
                  <View key={i} style={s.feedbackItem}>
                    <Svg width={12} height={12} viewBox="0 0 24 24">
                      <Path d="M21.801 10A10 10 0 1 1 17 3.335" stroke="#05df72" strokeWidth={2} fill="none"></Path>
                      <Path d="m9 11 3 3L22 4" stroke="#05df72" strokeWidth={2} fill="none"></Path>
                    </Svg>
                    <Text style={s.feedbackText}>{TimestampBlueText(item)}</Text>
                  </View>
                ))}
              </View>
              <View style={s.feedbackCol}>
                <Text style={s.feedbackColTitle}>Areas for Improvement</Text>
                {(data.creator_feedback.improvements ?? []).map((item, i) => (
                  <View key={i} style={s.feedbackItem}>
                    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                      <Circle cx="12" cy="12" r="10" stroke="#fdc700" strokeWidth={2} fill="none"></Circle>
                      <Line x1="12" x2="12" y1="8" y2="12" stroke="#fdc700" strokeWidth={2}></Line>
                      <Circle cx="12" cy="17" r="1" fill="#fdc700"/>
                    </Svg>
                    <Text style={s.feedbackText}>{TimestampBlueText(item)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : null}

      </Page>
    </Document>
  );
}

// Button Component
export function ExportPDFButton({
  analysisData,
  videoTitle,
  filename = "analysis-report",
}: ExportPDFButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await pdf(
        <AnalysisPDF data={analysisData} videoTitle={videoTitle} />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700 hover:border-zinc-600 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isExporting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Exporting...
        </>
      ) : (
        <>
          <Download className="h-4 w-4" />
          Export PDF
        </>
      )}
    </button>
  );
}