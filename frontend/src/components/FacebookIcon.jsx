export default function FacebookIcon({ size = 20, title = 'Facebook', ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" role={title ? 'img' : undefined} aria-label={title || undefined} {...props}>
    <path fill="currentColor" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.03 1.79-4.71 4.54-4.71 1.32 0 2.7.24 2.7.24v2.97h-1.52c-1.5 0-1.97.94-1.97 1.9v2.27h3.35l-.54 3.49h-2.81V24C19.61 23.1 24 18.1 24 12.07Z" />
  </svg>;
}
