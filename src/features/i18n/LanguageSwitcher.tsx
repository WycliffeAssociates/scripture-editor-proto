"use client";

import {useLingui} from "@lingui/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/primitives/select";

export function LanguageSwitcher() {
  const {i18n} = useLingui();

  const changeLanguage = (locale: string) => {
    i18n.activate(locale);
    localStorage.setItem("language", locale);
  };

  return (
    <Select value={i18n.locale} onValueChange={changeLanguage}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select language" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">English</SelectItem>
        <SelectItem value="es">Español</SelectItem>
      </SelectContent>
    </Select>
  );
}
