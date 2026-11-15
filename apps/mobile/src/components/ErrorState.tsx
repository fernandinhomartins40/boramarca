import { CircleX } from 'lucide-react-native';
import { EmptyState } from './EmptyState';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

/** Clear error + "Tentar de novo". */
export function ErrorState({
  title = 'Não deu para carregar',
  message = 'Confira a internet e tente de novo.',
  onRetry,
}: ErrorStateProps) {
  return (
    <EmptyState
      icon={CircleX}
      title={title}
      message={message}
      actionLabel={onRetry ? 'Tentar de novo' : undefined}
      onAction={onRetry}
    />
  );
}
