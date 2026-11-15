import Image from 'next/image';
import Link from 'next/link';

/** Kit horizontal logo (01-marca/svg/logo-horizontal-cor.svg), used as is. */
export function Logo({ className = 'h-8 w-auto' }: { className?: string }) {
  return (
    <Link href="/" className="inline-flex shrink-0 items-center" aria-label="Bora Marca, início">
      <Image
        src="/marca/logo-horizontal-cor.svg"
        alt="Bora Marca"
        width={1376}
        height={304}
        className={className}
        unoptimized
      />
    </Link>
  );
}
