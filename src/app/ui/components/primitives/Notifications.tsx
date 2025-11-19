import {
  type NotificationData,
  type NotificationsStore,
  notifications,
} from "@mantine/notifications";
import { CircleAlert } from "lucide-react";

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
    bg: "error",
    icon: <CircleAlert size={16} />,
  });
  return id;
}
export function ShowErrorNotificationSuccess({
  notification,
  // store,
}: NotificationProps) {
  const id = notifications.show({
    ...notification,
    bg: "success",
    icon: <CircleAlert size={16} />,
  });
  return id;
}
export function ShowErrorNotificationInfo({
  notification,
  // store,
}: NotificationProps) {
  const id = notifications.show({
    ...notification,
    // style: (theme) => ({
    //     root: {
    //         backgroundColor: theme.colors.gray[6],
    //     },
    // }),
    styles: (theme) => ({
      root: {
        backgroundColor: theme.colors.primary[6],
      },
    }),
    // icon: <CircleAlert size={16} />,
  });
  return id;
}
