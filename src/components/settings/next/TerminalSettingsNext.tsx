/**
 * 终端设置页（新骨架，G2）。
 *
 * 全键迁移旧 TerminalSettingsPage：Shell、字体/字号、配色、光标、滚动、
 * 行为开关、额外环境变量——读写统一走 appStore.terminalSettings /
 * updateTerminalSetting（localStorage 持久化，立即生效由 TerminalView 消费）。
 * 字体选择用 Popover + Command（可搜索，cmdk）。
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TERMINAL_COLOR_THEMES } from "@/types";
import type { TerminalSettings } from "@/types";
import { useAppStore } from "@/stores/appStore";
import { listSystemFonts } from "@/utils/ipc";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import SettingRow from "./SettingRow";
import SectionHeader from "./SectionHeader";

/** 字体选择器：Popover + Command 可搜索（数量大，Select 不适合） */
function FontPicker({
  value,
  fonts,
  onChange,
  ariaLabel,
}: {
  value: string;
  fonts: string[];
  onChange: (font: string) => void;
  ariaLabel: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-56 justify-between font-normal" aria-label={ariaLabel}>
          <span className="truncate">{value || t("settings.fontSystemDefault")}</span>
          <ChevronDown size={14} className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <Command>
          <CommandInput placeholder={t("settings.searchFonts")} />
          <CommandList>
            <CommandEmpty>{t("settings.noResults")}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="system-ui"
                onSelect={() => {
                  onChange("system-ui");
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-1 size-3.5", value === "system-ui" ? "opacity-100" : "opacity-0")} />
                {t("settings.fontSystemDefault")}
              </CommandItem>
              {fonts.map((font) => (
                <CommandItem
                  key={font}
                  value={font}
                  onSelect={() => {
                    onChange(font);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-1 size-3.5", value === font ? "opacity-100" : "opacity-0")} />
                  {font}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface TerminalSettingsNextProps {
  /** 搜索定位高亮的行锚点 */
  highlightKey?: string;
}

export default function TerminalSettingsNext({ highlightKey }: TerminalSettingsNextProps) {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.terminalSettings);
  const update = useAppStore((s) => s.updateTerminalSetting);
  const [fonts, setFonts] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    listSystemFonts()
      .then((list) => {
        if (!cancelled) setFonts(list);
      })
      .catch(() => {
        // 字体枚举失败保持空列表
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cursorOptions = useMemo(
    () => [
      { value: "block", label: t("settings.cursorBlock") },
      { value: "bar", label: t("settings.cursorBar") },
      { value: "underline", label: t("settings.cursorUnderline") },
    ],
    [t],
  );

  const row = (
    key: keyof TerminalSettings,
    label: string,
    control: React.ReactNode,
    description?: string,
  ) => (
    <SettingRow
      id={`settings.${key}`}
      label={label}
      description={description}
      highlight={highlightKey === `settings.${key}`}
    >
      {control}
    </SettingRow>
  );

  return (
    <div>
      <SectionHeader title="Shell" />
      {row("shell", t("settings.shell"), (
        <Input
          className="w-56"
          value={settings.shell}
          onChange={(e) => update("shell", e.target.value)}
        />
      ))}
      {row("shellArgs", t("settings.shellArgs"), (
        <Input
          className="w-56"
          value={settings.shellArgs}
          onChange={(e) => update("shellArgs", e.target.value)}
        />
      ))}

      <SectionHeader title={t("settings.terminalFont")} />
      {row("fontFamily", t("settings.terminalFont"), (
        <FontPicker
          value={settings.fontFamily}
          fonts={fonts}
          onChange={(font) => update("fontFamily", font)}
          ariaLabel={t("settings.terminalFont")}
        />
      ))}
      {row("fontSize", t("settings.terminalFontSize"), (
        <div className="flex w-48 items-center gap-3">
          <Slider
            value={[settings.fontSize]}
            min={8}
            max={32}
            step={1}
            onValueChange={([value]) => update("fontSize", value)}
          />
          <span className="w-6 text-right text-xs text-muted-foreground">{settings.fontSize}</span>
        </div>
      ))}
      {row("lineHeight", t("settings.lineHeight"), (
        <Input
          className="w-24"
          type="number"
          step="0.1"
          min="1"
          value={settings.lineHeight}
          onChange={(e) => update("lineHeight", Number(e.target.value) || 1)}
        />
      ))}

      <SectionHeader title={t("settings.colorTheme")} />
      {row("colorTheme", t("settings.colorTheme"), (
        <Select value={settings.colorTheme} onValueChange={(value) => update("colorTheme", value)}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TERMINAL_COLOR_THEMES.map((theme) => (
              <SelectItem key={theme.name} value={theme.name}>{theme.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {row("followAppTheme", t("settings.followAppTheme"), (
        <Switch
          checked={settings.followAppTheme}
          onCheckedChange={(checked) => update("followAppTheme", checked)}
        />
      ))}

      <SectionHeader title={t("settings.cursorStyle")} />
      {row("cursorStyle", t("settings.cursorStyle"), (
        <Select
          value={settings.cursorStyle}
          onValueChange={(value) => update("cursorStyle", value as TerminalSettings["cursorStyle"])}
        >
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {cursorOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {row("cursorBlink", t("settings.cursorBlink"), (
        <Switch
          checked={settings.cursorBlink}
          onCheckedChange={(checked) => update("cursorBlink", checked)}
        />
      ))}

      <SectionHeader title={t("settings.scrollback")} />
      {row("scrollback", t("settings.scrollback"), (
        <Input
          className="w-24"
          type="number"
          min="100"
          step="100"
          value={settings.scrollback}
          onChange={(e) => update("scrollback", Number(e.target.value) || 1000)}
        />
      ))}
      {row("scrollOnOutput", t("settings.scrollOnOutput"), (
        <Switch
          checked={settings.scrollOnOutput}
          onCheckedChange={(checked) => update("scrollOnOutput", checked)}
        />
      ))}

      <SectionHeader title={t("settings.bell")} />
      {row("bell", t("settings.bell"), (
        <Switch checked={settings.bell} onCheckedChange={(checked) => update("bell", checked)} />
      ))}
      {row("copyOnSelect", t("settings.copyOnSelect"), (
        <Switch
          checked={settings.copyOnSelect}
          onCheckedChange={(checked) => update("copyOnSelect", checked)}
        />
      ))}
      {row("rightClickPaste", t("settings.rightClickPaste"), (
        <Switch
          checked={settings.rightClickPaste}
          onCheckedChange={(checked) => update("rightClickPaste", checked)}
        />
      ))}

      <SectionHeader title={t("settings.envVars")} />
      {row("envVars", t("settings.envVars"), (
        <Textarea
          className="min-h-20 w-full md:w-72"
          placeholder="KEY=VALUE"
          value={settings.envVars}
          onChange={(e) => update("envVars", e.target.value)}
        />
      ), t("settings.envVarsHint"))}
    </div>
  );
}
