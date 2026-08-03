import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  Page,
  Layout,
  Text,
  Card,
  BlockStack,
  InlineGrid,
  EmptyState,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Dashboard() {
  return (
    <Page title="Dashboard">
      <TitleBar title="RecoAI" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Setup checklist
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    1. Install the theme extension
                  </Text>
                  <Text as="p" variant="bodyMd">
                    2. Enable tracking in your theme
                  </Text>
                  <Text as="p" variant="bodyMd">
                    3. Configure your first placement
                  </Text>
                  <Text as="p" variant="bodyMd">
                    4. View recommendations on your storefront
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">
                Attributed revenue (30d)
              </Text>
              <Text as="p" variant="headingLg">
                —
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">
                Total clicks
              </Text>
              <Text as="p" variant="headingLg">
                —
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">
                CTR
              </Text>
              <Text as="p" variant="headingLg">
                —
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">
                Active placements
              </Text>
              <Text as="p" variant="headingLg">
                0
              </Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        <Card>
          <EmptyState
            heading="Get started with RecoAI"
            action={{ content: "Create placement", url: "/app/placements" }}
            secondaryAction={{ content: "View analytics", url: "/app/analytics" }}
            image=""
          >
            <p>
              Install the app extension and create your first recommendation
              placement to start showing personalized products on your store.
            </p>
          </EmptyState>
        </Card>
      </BlockStack>
    </Page>
  );
}
