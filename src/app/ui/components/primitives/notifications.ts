import type { ReactNode } from "react";
import { toastManager } from "@/app/ui/components/primitives/toastManager.ts";

export type NotificationData = {
    id?: string;
    title?: ReactNode;
    message?: ReactNode;
    autoClose?: boolean | number;
    withCloseButton?: boolean;
};

type ToastTone = "error" | "success" | "info";

export type ManagedToastData = {
    message?: ReactNode;
    withCloseButton: boolean;
    tone: ToastTone;
    loading?: boolean;
};

function resolveTimeout(autoClose: NotificationData["autoClose"]) {
    if (autoClose === false) return 0;
    if (typeof autoClose === "number") return autoClose;
    if (autoClose === true || autoClose === undefined) return 5000;
    return 5000;
}

function showNotification(
    notification: NotificationData,
    tone: ToastTone,
    options?: { loading?: boolean },
) {
    return toastManager.add({
        id: notification.id,
        title: notification.title,
        description: notification.message,
        timeout: resolveTimeout(notification.autoClose),
        type: tone,
        data: {
            message: notification.message,
            withCloseButton: notification.withCloseButton !== false,
            tone,
            loading: options?.loading ?? false,
        } satisfies ManagedToastData,
    });
}

export function showErrorNotification({
    notification,
}: {
    notification: NotificationData;
}) {
    return showNotification(notification, "error");
}

export function showNotificationSuccess({
    notification,
}: {
    notification: NotificationData;
}) {
    return showNotification(notification, "success");
}

export function showNotificationInfo({
    notification,
}: {
    notification: NotificationData;
}) {
    return showNotification(notification, "info");
}

export function showProgressNotification(notification: NotificationData) {
    return showNotification(
        {
            ...notification,
            autoClose: false,
            withCloseButton: false,
        },
        "info",
        { loading: true },
    );
}

export function updateProgressNotification(
    id: string,
    notification: NotificationData,
) {
    toastManager.update(id, {
        title: notification.title,
        description: notification.message,
        timeout: 0,
        type: "info",
        data: {
            message: notification.message,
            withCloseButton: false,
            tone: "info",
            loading: true,
        } satisfies ManagedToastData,
    });
}

export function hideNotification(id: string) {
    toastManager.close(id);
}
