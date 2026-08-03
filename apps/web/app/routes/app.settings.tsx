import { Page, Card, Text, BlockStack } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

export default function SettingsPage() {
  return (
    <Page title="Settings">
      <TitleBar title="Settings" />
      <Card>
        <BlockStack gap="200">
          <Text as="p" variant="bodyMd">
            Manage exclusions and general configuration. Coming in a future
            sprint.
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );
}
