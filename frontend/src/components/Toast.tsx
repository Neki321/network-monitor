import { useLanguage } from "../context/LanguageContext";

type ToastProps = {
  message: string;
};

export function Toast({ message }: ToastProps) {
  const { t } = useLanguage();
  return (
    <div className="toast" role="status" aria-live="polite" aria-label={t.lastUpdate}>
      {message}
    </div>
  );
}
