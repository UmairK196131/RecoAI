import { Page, Card, Text, BlockStack } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

export default function AnalyticsPage() {
  return (
    <Page title="Analytics">
      <TitleBar title="Analytics" />
      <Card>
        <BlockStack gap="200">
          <Text as="p" variant="bodyMd">
            View recommendation performance metrics. Coming in a future sprint.
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );
}
