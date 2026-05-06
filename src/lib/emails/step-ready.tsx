import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Button,
  Hr,
} from '@react-email/components';
import * as React from 'react';

interface StepReadyEmailProps {
  tenderTitle: string;
  tenderNumber: string | null;
  stepNumber: number;
  stepName: string;
  stepNumberRange?: { from: number; to: number }; // for batched 2-3 emails
  newQuestionCount: number;
  ctaUrl: string;
}

const COLORS = {
  slate900: '#0F172A',
  slate700: '#334155',
  slate500: '#64748B',
  slate200: '#E2E8F0',
  slate50: '#F8FAFC',
  white: '#FFFFFF',
  stone50: '#FAFAF9',
  amber500: '#F59E0B',
};

// Per DESIGN_HANDOFF.md Pattern 1.
// Subject line: "שלב N מוכן למילוי — מכרז {tenderNumber}" (or batched form).
// No emoji, no exclamation marks. Eyebrow + slate-anchored layout.
export function StepReadyEmail({
  tenderTitle,
  tenderNumber,
  stepNumber,
  stepName,
  stepNumberRange,
  newQuestionCount,
  ctaUrl,
}: StepReadyEmailProps) {
  const headerLabel = stepNumberRange
    ? `שלבים ${stepNumberRange.from}–${stepNumberRange.to} מוכנים`
    : `שלב ${stepNumber} מוכן`;
  const preheader = `גילינו ${newQuestionCount} שאלות חדשות לשלב ${stepName}`;

  return (
    <Html lang="he" dir="rtl">
      <Head />
      <Preview>{preheader}</Preview>
      <Body style={{ backgroundColor: COLORS.stone50, fontFamily: "'Heebo', -apple-system, sans-serif", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: '560px', margin: '0 auto', padding: '40px 20px' }}>
          {/* Eyebrow + brand */}
          <Section>
            <Text
              style={{
                fontSize: '11px',
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: COLORS.slate500,
                margin: '0 0 24px 0',
              }}
            >
              TENDERIM · ניתוח מכרז
            </Text>
          </Section>

          {/* Card */}
          <Section
            style={{
              backgroundColor: COLORS.white,
              border: `0.5px solid ${COLORS.slate200}`,
              borderRadius: '12px',
              padding: '32px',
            }}
          >
            <Heading
              as="h1"
              style={{
                fontSize: '24px',
                fontWeight: 700,
                color: COLORS.slate900,
                lineHeight: 1.25,
                letterSpacing: '-0.01em',
                margin: '0 0 8px 0',
              }}
            >
              {headerLabel} למילוי
            </Heading>
            <Text style={{ fontSize: '14px', color: COLORS.slate500, margin: '0 0 24px 0' }}>
              {tenderTitle}
              {tenderNumber ? ` · מכרז ${tenderNumber}` : ''}
            </Text>

            <Text style={{ fontSize: '15px', color: COLORS.slate700, lineHeight: 1.65, margin: '0 0 24px 0' }}>
              {newQuestionCount === 1
                ? `שאלה חדשה זמינה במילוי ${stepName}.`
                : `${newQuestionCount} שאלות חדשות זמינות במילוי ${stepName}.`}{' '}
              נוכל לחסוך לך זמן — חלק מהן ימולאו אוטומטית מתשובות קודמות.
            </Text>

            <Button
              href={ctaUrl}
              style={{
                backgroundColor: COLORS.slate900,
                color: COLORS.white,
                fontSize: '14px',
                fontWeight: 500,
                padding: '12px 24px',
                borderRadius: '8px',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              עבור לשלב {stepNumber} ←
            </Button>
          </Section>

          {/* Footer */}
          <Section>
            <Hr style={{ borderColor: COLORS.slate200, margin: '32px 0 20px 0' }} />
            <Text style={{ fontSize: '12px', color: COLORS.slate500, lineHeight: 1.6, margin: 0 }}>
              קיבלת את ההודעה הזו כי החלת ניתוח מכרז בתנדרים. אם השלמת את המכרז בינתיים — אפשר להתעלם.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Subject builders — kept here so the worker can call them without rendering HTML.
export function stepReadySubject(stepNumber: number, tenderNumber: string | null): string {
  return `שלב ${stepNumber} מוכן למילוי${tenderNumber ? ` — מכרז ${tenderNumber}` : ''}`;
}

export function stepReadyBatchSubject(
  range: { from: number; to: number },
  tenderNumber: string | null
): string {
  return `שלבים ${range.from}-${range.to} מוכנים${tenderNumber ? ` — מכרז ${tenderNumber}` : ''}`;
}
