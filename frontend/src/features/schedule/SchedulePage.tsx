import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useMe } from '@/hooks/useBusiness'
import { useSchedule } from '@/hooks/useSchedule'
import { api, friendlyMessage } from '@/lib/api'
import { WEEKDAYS } from '@/lib/dates'
import type { ScheduleItem, ScheduleResponse } from '@/types/api'

function defaultDays(): ScheduleItem[] {
  return WEEKDAYS.map((_, weekday) => ({
    weekday,
    is_working: weekday < 5,
    start_time: weekday < 5 ? '09:00' : null,
    end_time: weekday < 5 ? '18:00' : null,
    slot_minutes: 30,
  }))
}

function fromResponse(items: ScheduleResponse[]): ScheduleItem[] {
  const byWeekday = new Map(items.map((item) => [item.weekday, item]))
  return WEEKDAYS.map((_, weekday) => {
    const item = byWeekday.get(weekday)
    return {
      weekday,
      is_working: item?.is_working ?? false,
      start_time: item?.start_time ? item.start_time.slice(0, 5) : null,
      end_time: item?.end_time ? item.end_time.slice(0, 5) : null,
      slot_minutes: item?.slot_minutes ?? 30,
    }
  })
}

export function SchedulePage() {
  const me = useMe()
  const businessId = me.data?.id
  const schedule = useSchedule(businessId)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [days, setDays] = useState<ScheduleItem[]>(defaultDays)
  const [slotMinutes, setSlotMinutes] = useState(30)

  useEffect(() => {
    if (!schedule.data) return
    const next = schedule.data.length ? fromResponse(schedule.data) : defaultDays()
    setDays(next)
    setSlotMinutes(next.find((day) => day.is_working)?.slot_minutes ?? 30)
  }, [schedule.data])

  const save = useMutation({
    mutationFn: (payload: ScheduleItem[]) =>
      api.put<ScheduleResponse[]>(`/business/${businessId}/schedule`, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['schedule', businessId] })
      navigate('/dashboard', { replace: true })
    },
  })

  function updateDay(weekday: number, patch: Partial<ScheduleItem>) {
    setDays((current) =>
      current.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)),
    )
  }

  if (me.isLoading || schedule.isLoading) {
    return (
      <div className="page-container space-y-4" aria-busy="true" aria-label="Loading schedule">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  if (me.isError || schedule.isError || !businessId) {
    return (
      <div className="page-container space-y-4">
        <Alert tone="error">{friendlyMessage(me.error ?? schedule.error)}</Alert>
        <Button onClick={() => void me.refetch()}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
        </Button>
      </div>
    )
  }

  const payload = days.map((day) => ({
    ...day,
    slot_minutes: day.is_working ? slotMinutes : day.slot_minutes,
    start_time: day.is_working ? day.start_time : null,
    end_time: day.is_working ? day.end_time : null,
  }))

  return (
    <div className="page-container space-y-5">
      <div>
        <p className="text-sm text-muted">Business portal</p>
        <h1 className="mt-1 text-[32px] font-bold tracking-tight">Working hours</h1>
        <p className="mt-1 text-sm text-muted">Set your days once. Clients see only free slots.</p>
      </div>

      {save.isError && <Alert tone="error">{friendlyMessage(save.error)}</Alert>}

      <Card>
        <Label htmlFor="slot-minutes">Slot duration</Label>
        <select
          id="slot-minutes"
          className="field-input"
          value={slotMinutes}
          onChange={(event) => setSlotMinutes(Number(event.target.value))}
        >
          {[15, 20, 30, 45, 60, 90].map((value) => (
            <option key={value} value={value}>
              {value} minutes
            </option>
          ))}
        </select>
      </Card>

      <div className="space-y-3">
        {days.map((day) => (
          <Card key={day.weekday} className="p-4">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={`day-${day.weekday}`} className="text-base font-semibold">
                {WEEKDAYS[day.weekday]}
              </label>
              <Switch
                id={`day-${day.weekday}`}
                checked={day.is_working}
                onCheckedChange={(checked) =>
                  updateDay(day.weekday, {
                    is_working: checked,
                    start_time: checked ? (day.start_time ?? '09:00') : null,
                    end_time: checked ? (day.end_time ?? '18:00') : null,
                  })
                }
                aria-label={`${WEEKDAYS[day.weekday]} enabled`}
              />
            </div>
            {day.is_working && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor={`start-${day.weekday}`}>Start</Label>
                  <Input
                    id={`start-${day.weekday}`}
                    type="time"
                    className="px-3"
                    value={day.start_time ?? '09:00'}
                    onChange={(event) => updateDay(day.weekday, { start_time: event.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`end-${day.weekday}`}>End</Label>
                  <Input
                    id={`end-${day.weekday}`}
                    type="time"
                    className="px-3"
                    value={day.end_time ?? '18:00'}
                    onChange={(event) => updateDay(day.weekday, { end_time: event.target.value })}
                  />
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      <Button
        loading={save.isPending}
        onClick={() => save.mutate(payload)}
        disabled={payload.some((day) => day.is_working && (!day.start_time || !day.end_time || day.start_time >= day.end_time))}
      >
        Save Schedule
      </Button>
      {payload.some((day) => day.is_working && day.start_time && day.end_time && day.start_time >= day.end_time) && (
        <p className="text-center text-sm text-danger">End time must be after start time.</p>
      )}
    </div>
  )
}
