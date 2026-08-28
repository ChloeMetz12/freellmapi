export interface EscalationEvent {
  projectIdentifier: string;
  reason: string;
  workOrderUrl: string;
  serviceAppointmentUrl: string;
  runId: string;
}

export interface Notifier {
  notify(event: EscalationEvent): Promise<void>;
}
