import { Page, Card, Text, BlockStack } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

export default function BillingPage() {
  return (
    <Page title="Billing">
      <TitleBar title="Billing" />
      <Card>
        <BlockStack gap="200">
          <Text as="p" variant="bodyMd">
            View your plan and usage. Coming in a future sprint.
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );
}
