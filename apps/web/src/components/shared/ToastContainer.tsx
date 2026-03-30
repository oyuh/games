import { FiX, FiAlertCircle, FiCheckCircle, FiInfo } from "react-icons/fi";
import { useToasts, dismissToast } from "../../lib/toast";
import "../../styles/toast.css";

const icons = {
  error: <FiAlertCircle size={16} />,
  success: <FiCheckCircle size={16} />,
  info: <FiInfo size={16} />,
};

export function ToastContainer() {
  const toasts = useToasts();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.level}`}>
          <span className="toast-icon">{icons[t.level]}</span>
          <span className="toast-msg">{t.message}</span>
          <button className="toast-dismiss" onClick={() => dismissToast(t.id)}>
            <FiX size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
