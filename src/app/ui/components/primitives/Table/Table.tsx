import type { ReactNode } from "react";

import * as styles from "./table.css.ts";

export interface TableProps {
  children: ReactNode;
  className?: string;
  striped?: boolean;
  withBorder?: boolean;
}

export function Table({
  children,
  className,
  striped,
  withBorder,
}: TableProps) {
  return (
    <table
      className={`${styles.table} ${striped ? styles.tableStriped : ""} ${withBorder ? styles.tableBordered : ""} ${className || ""}`}
    >
      {children}
    </table>
  );
}

export interface TableHeadProps {
  children: ReactNode;
  className?: string;
}

export function TableHead({ children, className }: TableHeadProps) {
  return (
    <thead className={`${styles.tableHead} ${className || ""}`}>
      {children}
    </thead>
  );
}

export interface TableBodyProps {
  children: ReactNode;
  className?: string;
}

export function TableBody({ children, className }: TableBodyProps) {
  return (
    <tbody className={`${styles.tableBody} ${className || ""}`}>
      {children}
    </tbody>
  );
}

export interface TableRowProps {
  children: ReactNode;
  className?: string;
}

export function TableRow({ children, className }: TableRowProps) {
  return (
    <tr className={`${styles.tableRow} ${className || ""}`}>{children}</tr>
  );
}

export interface TableHeaderProps {
  children: ReactNode;
  className?: string;
}

export function TableHeader({ children, className }: TableHeaderProps) {
  return (
    <th className={`${styles.tableHeader} ${className || ""}`}>{children}</th>
  );
}

export interface TableCellProps {
  children?: ReactNode;
  className?: string;
}

export function TableCell({ children, className }: TableCellProps) {
  return (
    <td className={`${styles.tableCell} ${className || ""}`}>{children}</td>
  );
}
