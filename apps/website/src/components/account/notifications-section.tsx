"use client";

import { toast } from "sonner";
import { Field, Section, Spinner } from "@/components/account/shared";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Input } from "@tradstry/app-ui/components/ui/input";
import { Label } from "@tradstry/app-ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tradstry/app-ui/components/ui/select";
import { Switch } from "@tradstry/app-ui/components/ui/switch";
import {
  useNotificationPreferences,
  useNotificationSettings,
  useSetNotificationPreference,
  useSetNotificationSettings,
  useTimezoneSync,
  useWebPush,
} from "@tradstry/app-ui/hooks/notifications";
import {
  DAYS_OF_WEEK,
  minuteToTime,
  NOTIFICATION_EVENT_LABELS,
  type NotificationEventType,
  type NotificationSettingsPatch,
  timeToMinute,
} from "@tradstry/app-ui/lib/types/notifications";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function PushSection() {
  const push = useWebPush();

  async function toggle() {
    try {
      if (push.enabled) {
        await push.disable();
        toast.success("Push notifications turned off for this device");
      } else {
        await push.enable();
        toast.success("Push notifications turned on for this device");
      }
    } catch (err) {
      toast.error(errorMessage(err, "Could not update push notifications"));
    }
  }

  const blocked = push.permission === "denied";

  return (
    <Section title="Push notifications">
      {!push.supported ? (
        <p className="text-xs text-muted-foreground">
          Not supported in this browser.
        </p>
      ) : !push.configured ? (
        <p className="text-xs text-muted-foreground">
          Push notifications are unavailable.
        </p>
      ) : push.isLoading ? (
        <Spinner />
      ) : (
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium">
              {push.enabled ? "On in this browser" : "Off in this browser"}
            </p>
            {blocked ? (
              <p className="mt-1 text-xs text-destructive">
                Blocked by your browser. Allow notifications in site settings.
              </p>
            ) : null}
          </div>
          <Button
            variant={push.enabled ? "outline" : "default"}
            size="sm"
            className="min-w-20"
            onClick={toggle}
            disabled={push.isPending || (blocked && !push.enabled)}
            aria-busy={push.isPending}
            aria-label={push.isPending ? "Updating push notifications" : undefined}
          >
            {push.isPending ? <Spinner /> : push.enabled ? "Turn off" : "Turn on"}
          </Button>
        </div>
      )}
    </Section>
  );
}

function PreferencesSection() {
  const { data: preferences, isLoading } = useNotificationPreferences();
  const setPreference = useSetNotificationPreference();

  return (
    <Section
      title="Notify me about"
      description="Applies to in-app and push notifications."
    >
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="divide-y divide-border/50">
          {(preferences ?? []).map((preference) => {
            const meta =
              NOTIFICATION_EVENT_LABELS[
                preference.eventType as NotificationEventType
              ];
            const id = `notification-pref-${preference.eventType}`;

            return (
              <div
                key={preference.eventType}
                className="flex min-h-10 items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
              >
                <Label
                  htmlFor={id}
                  title={meta?.description}
                  className="min-w-0 flex-1 cursor-pointer py-1 text-xs font-medium"
                >
                  {meta?.label ?? preference.eventType}
                </Label>
                <Switch
                  id={id}
                  aria-description={meta?.description}
                  checked={preference.enabled}
                  onCheckedChange={(enabled) =>
                    setPreference.mutate({
                      eventType: preference.eventType,
                      enabled,
                    })
                  }
                />
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function ScheduleSection() {
  const { data: settings, isLoading } = useNotificationSettings();
  const setSettings = useSetNotificationSettings();

  function patch(next: NotificationSettingsPatch) {
    setSettings.mutate(next, {
      onError: (err) =>
        toast.error(errorMessage(err, "Could not update schedule")),
    });
  }

  function onTimeChange(field: "dailyRecapMinute" | "weeklyReviewMinute") {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      const minute = timeToMinute(event.target.value);
      if (minute !== null) patch({ [field]: minute });
    };
  }

  const quietOn =
    settings?.quietStartMinute != null && settings?.quietEndMinute != null;

  return (
    <Section
      title="Schedule"
      description={settings ? `Times shown in ${settings.timezone}.` : undefined}
    >
      {isLoading || !settings ? (
        <Spinner />
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="recap-at" className="text-xs font-medium">
              Daily reminder
            </Label>
            <Input
              id="recap-at"
              type="time"
              className="w-32"
              defaultValue={minuteToTime(settings.dailyRecapMinute)}
              onChange={onTimeChange("dailyRecapMinute")}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="review-dow" className="text-xs font-medium">
              Weekly review
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={String(settings.weeklyReviewDow)}
                onValueChange={(value) =>
                  patch({ weeklyReviewDow: Number(value) })
                }
              >
                <SelectTrigger id="review-dow" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start" sideOffset={4}>
                  {DAYS_OF_WEEK.map((day, i) => (
                    <SelectItem key={day} value={String(i)}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                aria-label="Weekly review time"
                type="time"
                className="w-28"
                defaultValue={minuteToTime(settings.weeklyReviewMinute)}
                onChange={onTimeChange("weeklyReviewMinute")}
              />
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 border-t border-border/60 pt-4">
            <div className="min-w-0">
              <Label htmlFor="quiet" className="text-xs font-medium">
                Quiet hours
              </Label>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Delay push notifications during this window.
              </p>
            </div>
            <Switch
              id="quiet"
              checked={quietOn}
              onCheckedChange={(on) =>
                patch(
                  on
                    ? { quietStartMinute: 1320, quietEndMinute: 420 }
                    : { quietStartMinute: null, quietEndMinute: null },
                )
              }
            />
          </div>

          {quietOn ? (
            <div className="flex flex-wrap items-end justify-end gap-2">
              <Field label="From" htmlFor="quiet-from">
                <Input
                  id="quiet-from"
                  type="time"
                  className="w-32"
                  defaultValue={minuteToTime(settings.quietStartMinute ?? 1320)}
                  onChange={(e) => {
                    const m = timeToMinute(e.target.value);
                    if (m !== null) patch({ quietStartMinute: m });
                  }}
                />
              </Field>
              <Field label="To" htmlFor="quiet-to">
                <Input
                  id="quiet-to"
                  type="time"
                  className="w-32"
                  defaultValue={minuteToTime(settings.quietEndMinute ?? 420)}
                  onChange={(e) => {
                    const m = timeToMinute(e.target.value);
                    if (m !== null) patch({ quietEndMinute: m });
                  }}
                />
              </Field>
            </div>
          ) : null}
        </div>
      )}
    </Section>
  );
}

export function NotificationsSection() {
  useTimezoneSync();

  return (
    <div className="grid gap-4">
      <PushSection />
      <ScheduleSection />
      <PreferencesSection />
    </div>
  );
}
