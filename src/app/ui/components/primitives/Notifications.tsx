import { type NotificationData, notifications } from "@mantine/notifications";
import { Check, Info, Loader2, X } from "lucide-react";
import * as styles from "@/app/ui/styles/modules/Notifications.module.css.ts";

type NotificationProps = {
    notification: NotificationData;
    // store?: NotificationsStore;
};
export function ShowErrorNotification({
    notification,
    // store,
}: NotificationProps) {
    const id = notifications.show({
        ...notification,
        classNames: {
            root: styles.errorRoot,
            icon: styles.errorIcon,
            closeButton: styles.errorCloseButton,
            description: styles.message,
        },
        icon: <X size={16} />,
    });
    return id;
}
export function ShowNotificationSuccess({
    notification,
    // store,
}: NotificationProps) {
    const id = notifications.show({
        ...notification,
        classNames: {
            root: styles.successRoot,
            icon: styles.successIcon,
            closeButton: styles.successCloseButton,
            description: styles.message,
        },
        icon: <Check size={16} />,
    });
    return id;
}
export function ShowNotificationInfo({ notification }: NotificationProps) {
    const id = notifications.show({
        ...notification,
        classNames: {
            root: styles.infoRoot,
            icon: styles.infoIcon,
            closeButton: styles.infoCloseButton,
            description: styles.message,
        },
        icon: <Info size={16} />,
    });
    return id;
}

export function ShowImportStartedNotification({
    notification,
    // store,
}: NotificationProps) {
    const id = notifications.show({
        ...notification,
        classNames: {
            root: styles.infoRoot,
            icon: styles.infoIcon,
            closeButton: styles.infoCloseButton,
            description: styles.message,
        },
        icon: <Loader2 size={16} />,
    });
    return id;
}

export function showProgressNotification(notification: NotificationData) {
    const id = notifications.show({
        ...notification,
        autoClose: false,
        withCloseButton: false,
        classNames: {
            root: styles.infoRoot,
            icon: styles.infoIcon,
            description: styles.message,
        },
        icon: <Loader2 size={16} className={styles.spinningIcon} />,
    });
    return id;
}

export function updateProgressNotification(
    id: string,
    notification: NotificationData,
) {
    notifications.update({
        id,
        ...notification,
        autoClose: false,
        withCloseButton: false,
        classNames: {
            root: styles.infoRoot,
            icon: styles.infoIcon,
            description: styles.message,
        },
        icon: <Loader2 size={16} className={styles.spinningIcon} />,
    });
}

export function hideNotification(id: string) {
    notifications.hide(id);
}
