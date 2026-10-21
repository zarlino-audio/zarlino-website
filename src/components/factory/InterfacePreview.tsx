/**
 * Schematic preview of one of the three Zarlino interfaces.
 *
 * This is a faithful *schematic* of what the template draws — the same controls,
 * in the same groups, at the same density, with knobs/faders/switches/selects
 * distinguished, and the same one- vs two-column layout. It is not a pixel
 * replica of the plugin window (that is drawn by the shell's own layout engine
 * after the build); the label says so.
 */

import type { PlanPreview } from "./api";

interface Props {
  preview: PlanPreview;
  accentColor?: string;
  selected?: boolean;
  onSelect?: () => void;
  compact?: boolean;
}

function ControlGlyph({ kind, value }: { kind: string; value: number }) {
  if (kind === "switch") {
    return (
      <span className="inline-flex h-4 w-7 items-center rounded-full bg-[rgba(255,255,255,0.14)] px-[2px]">
        <span className="block h-3 w-3 rounded-full bg-[#94A3B8]" />
      </span>
    );
  }
  if (kind === "select") {
    return <span className="inline-block h-3 w-7 rounded-[3px] border border-[rgba(255,255,255,0.2)]" />;
  }
  if (kind === "fader") {
    return (
      <span className="relative inline-block h-4 w-[3px] rounded-full bg-[rgba(255,255,255,0.16)]">
        <span className="absolute left-1/2 top-[3px] h-[6px] w-[9px] -translate-x-1/2 rounded-[2px] bg-[#CBD5E1]" />
      </span>
    );
  }
  return (
    <span className="relative inline-block h-4 w-4 rounded-full border border-[rgba(255,255,255,0.28)]">
      <span
        className="absolute left-1/2 top-[2px] h-[5px] w-[1.5px] -translate-x-1/2 rounded-full bg-[#CBD5E1]"
        style={{ transform: `rotate(${-120 + Math.max(0, Math.min(1, value)) * 240}deg)`, transformOrigin: "50% 100%" }}
      />
    </span>
  );
}

export default function InterfacePreview({ preview, accentColor = "#4C9AFF", selected = false, onSelect, compact = false }: Props) {
  const groups = groupRows(preview);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "w-full rounded-2xl border p-4 text-left transition-colors",
        selected ? "border-[rgba(255,255,255,0.4)] bg-[rgba(255,255,255,0.06)]" : "border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.24)]",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-['Space_Grotesk'] text-[15px] font-semibold text-white">{preview.label}</span>
        <span className="font-['Inter'] text-[11px] text-[#64748B]">
          {preview.drawnCount} of {preview.availableCount} controls · {Math.round(preview.density * 100)}% density
        </span>
      </div>
      <p className="mt-1 font-['Inter'] text-[12px] leading-[1.6] text-[#94A3B8]">{preview.description}</p>

      <div
        className={[
          "mt-3 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#07080A] p-3",
          compact ? "min-h-[104px]" : "min-h-[168px]",
        ].join(" ")}
        style={{ borderTopColor: accentColor, borderTopWidth: 2 }}
        aria-hidden="true"
      >
        {groups.length === 0 ? (
          <p className="font-['Inter'] text-[11px] text-[#64748B]">No controls yet — describe the processor first.</p>
        ) : (
          groups.slice(0, compact ? 2 : 6).map((group) => (
            <div key={group.name} className="mb-2 last:mb-0">
              <div className="mb-1 font-['Inter'] text-[9px] uppercase tracking-[0.14em] text-[#475569]">{group.name}</div>
              <div className={preview.columns === 1 ? "flex flex-col gap-1" : "grid grid-cols-2 gap-1"}>
                {group.controls.slice(0, compact ? 3 : 8).map((control) => (
                  <div key={control.id} className="flex items-center gap-2">
                    <ControlGlyph kind={control.kind} value={control.default} />
                    <span className="truncate font-['Inter'] text-[10px] text-[#CBD5E1]">{control.label}</span>
                    {preview.showsUnits && control.unit ? (
                      <span className="font-['Inter'] text-[9px] text-[#64748B]">{control.unit}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-['Inter'] text-[10px] text-[#64748B]">
        <span>{preview.columns === 1 ? "One column" : "Two columns"}</span>
        <span>{preview.showsUnits ? "Units shown" : "Labels only"}</span>
        <span>{preview.showsValueReadouts ? "Values + ranges" : "No readouts"}</span>
        {preview.hiddenCount > 0 ? <span>{preview.hiddenCount} controls behind Advanced</span> : null}
      </div>
    </button>
  );
}

function groupRows(preview: PlanPreview): Array<{ name: string; controls: PlanPreview["controls"] }> {
  const groups: Array<{ name: string; controls: PlanPreview["controls"] }> = [];
  for (const control of preview.controls) {
    let group = groups.find((candidate) => candidate.name === control.group);
    if (!group) {
      group = { name: control.group, controls: [] };
      groups.push(group);
    }
    group.controls.push(control);
  }
  return groups;
}
