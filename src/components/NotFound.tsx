import ErrorScreen from '@components/ui/ErrorScreen';

export default function NotFound() {
  return (
    <ErrorScreen code="404" title="We have lost this page">
      The page you asked for is missing or has moved. Check the address, or head back to your fleet.
    </ErrorScreen>
  );
}
