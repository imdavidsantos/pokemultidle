export function VolumeConfigIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* alto-falante + ondas, centralizados e um pouco maiores */}
      <g transform="translate(-0.7 2.6) scale(1.25)">
        <path d="M3 5.5h3.2L10.5 2.5v10L6.2 9.5H3z" fill="currentColor" />
        <path d="M13 5a3.5 3.5 0 0 1 0 5" />
        <path d="M15.5 3a6.5 6.5 0 0 1 0 9" />
      </g>
    </svg>
  );
}
