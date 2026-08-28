/**
 * Every Salesforce-specific button label, field name, and picklist value
 * lives here and ONLY here. Nothing outside this file should hardcode a
 * Salesforce UI string.
 *
 * IMPORTANT: the values below are best-guess placeholders transcribed from
 * a training-meeting transcript, NOT verified against a real Salesforce
 * org (no sandbox was available while this tool was built). Before running
 * anything in `live` mode:
 *
 *   1. Run the discovery phase: `npx playwright codegen <org-login-url>`
 *      against production, off-hours, under the virtual display.
 *   2. Manually walk the full flow once (project record -> Install Work
 *      Order -> New -> Save -> set Work Order fields -> Save ->
 *      Get Candidates -> Dispatched), noting the codegen's recorded
 *      role/label/text locators.
 *   3. Replace every placeholder below with the real value. Prefer
 *      role/label/text locators (getByRole/getByLabel/getByText) over CSS
 *      or XPath -- Lightning's DOM class names are unstable, but its
 *      accessibility tree is not.
 *
 * See README.md "Discovery phase" for the full checklist.
 */

export const selectors = {
  navigation: {
    /** The "..." (ellipses / communication dots) menu on a record page. */
    ellipsesMenuButton: { role: "button", name: "More Actions" } as const,
    fieldServiceMenuItem: { role: "menuitem", name: "Field Service" } as const,
  },

  projectRecord: {
    installWorkOrderButton: { role: "button", name: "Install Work Order" } as const,
    newOptionInDialog: { role: "option", name: "New" } as const,
    saveButton: { role: "button", name: "Save" } as const,

    /** Field labels scraped off the source project/Opportunity record. */
    fields: {
      installScheduledDate: "Installation Scheduled",
      description: "Description",
    },
  },

  workOrder: {
    ownerField: "Owner",
    dispatcherField: "Dispatcher",
    workOrderTypeField: "Work Order Type",
    includeBatteryCheckbox: "Include Battery",
    includeInstallCheckbox: "Include Install",
    serviceTerritoryField: "Service Territory",
    serviceDateField: "Service Date",
    descriptionField: "Description",
    saveButton: { role: "button", name: "Save" } as const,
  },

  serviceAppointment: {
    getCandidatesButton: { role: "button", name: "Get Candidates" } as const,
    /** Container Get Candidates renders its ranked list into, once it succeeds. */
    candidateListContainer: { role: "list", name: "Candidates" } as const,
    candidateListItem: { role: "listitem" } as const,
    /** Text shown when Get Candidates returns zero results (vs. erroring outright -- confirm both cases during discovery). */
    noCandidatesText: "No candidates found",
  },

  dispatchConsole: {
    dayViewButton: { role: "button", name: "Day" } as const,
    appointmentContextMenu: {
      dispatchedStatusItem: { role: "menuitem", name: "Dispatched" } as const,
    },
    /** Text/label on the Gantt board confirming an appointment's current status after reload. */
    statusBadge: { role: "status" } as const,
  },

  account: {
    relatedTab: { role: "tab", name: "Related" } as const,
    newNoteButton: { role: "button", name: "New Note" } as const,
  },
} as const;
