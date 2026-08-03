import { Page, Card, Text, BlockStack } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

export default function PlacementsPage() {
  return (
    <Page title="Placements">
      <TitleBar title="Placements" />
      <Card>
        <BlockStack gap="200">
          <Text as="p" variant="bodyMd">
            Configure recommendation widgets for your storefront. Coming in a
            future sprint.
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );
}
