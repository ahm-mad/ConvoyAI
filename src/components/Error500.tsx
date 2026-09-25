import ErrorScreen from '@components/ui/ErrorScreen';

export default function Error500() {
  return (
    <ErrorScreen code="500" title="Something went wrong on our side">
      An unexpected error stopped this page from loading. Please try again in a moment.
    </ErrorScreen>
  );
}
