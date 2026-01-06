import * as React from "react";
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Button,
  Hr,
} from "@react-email/components";

interface MagicLinkEmailTemplateProps {
  firstName: string;
  magicLinkUrl: string;
}

export function MagicLinkEmailTemplate({
  firstName,
  magicLinkUrl,
}: MagicLinkEmailTemplateProps) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.6" }}>
        <Container style={{ maxWidth: "600px", margin: "0 auto", padding: "20px" }}>
          <Heading
            style={{
              color: "#1a1a1a",
              fontSize: "24px",
              marginBottom: "20px",
            }}
          >
            Sign in to your account
          </Heading>
          <Text style={{ color: "#4a4a4a", marginBottom: "20px" }}>
            Hello {firstName},
          </Text>
          <Text style={{ color: "#4a4a4a", marginBottom: "30px" }}>
            Click the button below to sign in to your account. This link will
            expire in 5 minutes.
          </Text>
          <Section style={{ marginBottom: "30px", textAlign: "center" }}>
            <Button
              href={magicLinkUrl}
              style={{
                backgroundColor: "#1a1a1a",
                color: "#ffffff",
                padding: "12px 24px",
                borderRadius: "6px",
                fontWeight: "600",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Sign In
            </Button>
          </Section>
          <Hr style={{ marginTop: "30px", marginBottom: "20px" }} />
          <Text
            style={{
              color: "#6a6a6a",
              fontSize: "14px",
              marginBottom: "10px",
            }}
          >
            Or copy and paste this URL into your browser:
          </Text>
          <Text
            style={{
              color: "#6a6a6a",
              fontSize: "12px",
              wordBreak: "break-all",
              backgroundColor: "#f5f5f5",
              padding: "10px",
              borderRadius: "4px",
            }}
          >
            {magicLinkUrl}
          </Text>
          <Text
            style={{
              color: "#6a6a6a",
              fontSize: "12px",
              marginTop: "30px",
            }}
          >
            If you didn't request this link, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

