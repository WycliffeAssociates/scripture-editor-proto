import { Toast } from "@base-ui/react/toast";
import { Check, Info, Loader2, X } from "lucide-react";

import type { ManagedToastData } from "@/app/ui/components/primitives/notifications.ts";
import { toastManager } from "@/app/ui/components/primitives/toastManager.ts";
import * as styles from "@/app/ui/styles/modules/Notifications.module.css.ts";

export function NotificationViewport() {
  return (
    <Toast.Provider toastManager={toastManager}>
      <Toast.Portal>
        <Toast.Viewport className={styles.viewport}>
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ToastList() {
  const manager = Toast.useToastManager<ManagedToastData>();

  return manager.toasts.map((toast) => (
    <NotificationToast key={toast.id} toast={toast} />
  ));
}

function NotificationToast(props: {
  toast: Toast.Root.ToastObject<ManagedToastData>;
}) {
  const { toast } = props;
  const data = toast.data;
  const tone = data?.tone ?? "info";
  const className = styles.toastRootByTone[tone];
  const iconClassName = styles.toastIconByTone[tone];
  const closeButtonClassName = styles.toastCloseButtonByTone[tone];

  return (
    <Toast.Root toast={toast} className={className}>
      <Toast.Content className={styles.toastContent}>
        <div className={iconClassName}>{renderToastIcon(data)}</div>
        <div className={styles.textContent}>
          {toast.title ? (
            <Toast.Title className={styles.title}>{toast.title}</Toast.Title>
          ) : null}
          {data?.message ? (
            <Toast.Description className={styles.message}>
              {data.message}
            </Toast.Description>
          ) : null}
        </div>
        {data?.withCloseButton !== false ? (
          <Toast.Close
            className={closeButtonClassName}
            aria-label="Close notification"
          >
            <X size={16} />
          </Toast.Close>
        ) : null}
      </Toast.Content>
    </Toast.Root>
  );
}

function renderToastIcon(data?: ManagedToastData) {
  if (data?.loading) {
    return <Loader2 size={16} className={styles.spinningIcon} />;
  }

  switch (data?.tone) {
    case "error":
      return <X size={16} />;
    case "success":
      return <Check size={16} />;
    default:
      return <Info size={16} />;
  }
}
