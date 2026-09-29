import type { ComponentProps } from 'react';
import { CloseIcon } from '@/components/ui/CloseIcon';

export function CloseButton({ disabled, onClick }: Pick<ComponentProps<'button'>, 'disabled' | 'onClick'>) {
  return <button type="button" className="ops-close-button" aria-label="닫기" title="닫기" disabled={disabled} onClick={onClick}><CloseIcon /></button>;
}
