# AI Planning Bot Plan

## Goal

Build an AI planning assistant for the RSVP system that helps event organizers plan guest groups and seating through a guided conversation, then converts the conversation into structured planning constraints and seating proposals that a manager can review and apply.

The assistant must support Arabic conversation while reliably matching guest and group names that are stored in Hebrew or English.

## Product Scope

The bot should do five things well:

1. Run a multilingual planning conversation with the event organizer.
2. Extract structured rules from the conversation.
3. Resolve guest and group references against existing RSVP data.
4. Generate seating and grouping proposals using the current hall layout.
5. Let managers review, edit, approve, reject, and apply suggestions safely.

The bot should not write directly to final seating or guest assignments without an explicit user approval step.

## Core Design Principles

1. AI suggests, managers approve.
2. Guest names are matched, not overwritten.
3. Structured constraints drive planning more than free text.
4. Hard constraints are never silently broken.
5. Every AI action is auditable.
6. Multilingual support is first-class, not an afterthought.

## User Stories

### Organizer stories

1. As an organizer, I want to describe seating wishes in Arabic, Hebrew, or English.
2. As an organizer, I want the bot to understand family groupings, VIP placement, accessibility needs, and social separation rules.
3. As an organizer, I want to see the bot's understanding before it changes the event.

### Manager stories

1. As a manager, I want to review extracted rules and edit them manually.
2. As a manager, I want to see which guest or group the bot matched from multilingual input.
3. As a manager, I want a seating proposal with explanations and conflicts.
4. As a manager, I want to apply all or part of the proposal.

### Operations stories

1. As staff, I want the approved plan to flow into the existing hall and guest management screens.
2. As an admin, I want a full audit trail of planning actions.

## High-Level Architecture

The bot will have six layers.

### 1. Planning UI layer

Primary location: `frontend/src/pages/EventDetail.js`

Add a new `AI Planning Assistant` section with:

1. Chat panel
2. Language selector
3. Extract constraints button
4. Suggest groups button
5. Generate seating proposal button
6. Constraints review list
7. Match review list
8. Proposal review panel
9. Apply selected suggestions button

### 2. Planning API layer

New backend routes under `backend/src/routes/events.js` or a new planning routes file.

Suggested endpoints:

1. `GET /api/events/:id/planning`
2. `POST /api/events/:id/planning/messages`
3. `POST /api/events/:id/planning/extract-constraints`
4. `POST /api/events/:id/planning/resolve-references`
5. `POST /api/events/:id/planning/suggest-groups`
6. `POST /api/events/:id/planning/generate-seating`
7. `POST /api/events/:id/planning/apply-suggestion`
8. `PUT /api/events/:id/planning/constraints/:constraintId`
9. `DELETE /api/events/:id/planning/constraints/:constraintId`

### 3. AI orchestration layer

New service files:

1. `backend/src/services/aiPlanningService.js`
2. `backend/src/services/planningPromptService.js`

Responsibilities:

1. Chat response generation
2. Constraint extraction
3. Structured JSON validation
4. Language-aware responses
5. Explanation generation for proposals

### 4. Reference resolution layer

New service files:

1. `backend/src/services/nameMatchingService.js`
2. `backend/src/services/transliterationService.js`

Responsibilities:

1. Normalize Arabic, Hebrew, and English guest/group references
2. Build candidate matches against existing guest and group data
3. Return scored matches with confidence
4. Request confirmation if confidence is not strong enough

### 5. Planning engine layer

New service file:

1. `backend/src/services/seatingPlannerService.js`

Responsibilities:

1. Convert constraints into a planning model
2. Score valid table and seat options
3. Find contiguous seat blocks
4. Generate final proposal payloads
5. Return conflicts and unresolved cases

### 6. Persistence and audit layer

Use existing event and guest persistence with new planning-specific fields.

All AI interactions and approvals should be written into `activityLog` and planning-specific collections inside the event document.

## Data Model Changes

### Event model changes

Extend `backend/src/models/Event.js` with the following fields.

#### `planningConversation`

```js
planningConversation: [
  {
    id: String,
    role: { type: String, enum: ['user', 'assistant', 'system'] },
    language: { type: String, enum: ['he', 'en', 'ar'], default: 'he' },
    text: String,
    createdAt: { type: Date, default: Date.now },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  }
]
```

#### `planningConstraints`

```js
planningConstraints: [
  {
    id: String,
    type: String,
    priority: { type: String, enum: ['hard', 'soft'], default: 'soft' },
    targetType: String,
    targetIds: [String],
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
    sourceMessageId: String,
    sourceLanguage: String,
    confidence: Number,
    status: { type: String, enum: ['draft', 'confirmed', 'rejected'], default: 'draft' },
    explanation: String,
    createdAt: { type: Date, default: Date.now }
  }
]
```

#### `planningSuggestions`

```js
planningSuggestions: [
  {
    id: String,
    type: { type: String, enum: ['grouping', 'seating'] },
    status: { type: String, enum: ['draft', 'approved', 'rejected', 'partially_applied'], default: 'draft' },
    summary: String,
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    explanations: [String],
    conflicts: [{ type: mongoose.Schema.Types.Mixed, default: {} }],
    createdAt: { type: Date, default: Date.now },
    appliedAt: Date,
    appliedBy: {
      id: String,
      username: String,
      role: String,
    }
  }
]
```

#### `planningMetadata`

```js
planningMetadata: {
  preferredLanguage: { type: String, enum: ['he', 'en', 'ar'], default: 'he' },
  lastPlanningRunAt: Date,
  lastPlanningModel: String,
  nameResolutionVersion: String,
}
```

### Guest model changes

Extend `backend/src/models/Guest.js` with multilingual matching and planning fields.

#### `displayName`

The name shown in the UI. Usually the existing source-of-truth name.

#### `searchAliases`

```js
searchAliases: [String]
```

#### `languageVariants`

```js
languageVariants: {
  he: String,
  en: String,
  ar: String,
}
```

#### `tags`

```js
tags: [String]
```

Suggested values:

1. `vip`
2. `elderly`
3. `kids`
4. `accessible`
5. `family`
6. `speaker-family`

#### `seatPreferences`

```js
seatPreferences: {
  preferredZone: String,
  avoidZone: String,
  nearEntrance: Boolean,
  nearStage: Boolean,
  accessibleOnly: Boolean,
}
```

#### `relationshipHints`

```js
relationshipHints: {
  mustSeatWithGuestIds: [String],
  mustNotSeatWithGuestIds: [String],
}
```

#### `priorityScore`

```js
priorityScore: { type: Number, default: 0 }
```

### Group structure changes

Inside `Event.groups`, add multilingual aliases.

```js
aliases: [String],
languageVariants: {
  he: String,
  en: String,
  ar: String,
}
```

### Hall layout changes

Inside each `hallLayout` table object, add planning metadata.

```js
zone: String,
nearStageScore: Number,
nearEntranceScore: Number,
accessibilityFriendly: Boolean,
noiseLevel: Number,
```

## Conversation Design

### Chat modes

The assistant should support three modes:

1. Discovery mode
The bot asks planning questions and clarifies missing details.

2. Constraint review mode
The bot summarizes what it understood in structured form.

3. Proposal mode
The bot explains its grouping or seating suggestions.

### Recommended conversation flow

1. Ask preferred language.
2. Ask event type and planning priorities.
3. Ask for guest groups that must sit together.
4. Ask for people or groups that must stay apart.
5. Ask for VIP, family elders, accessible seating, kids, and special needs.
6. Ask about preferred zones or reserved tables.
7. Summarize extracted rules.
8. Ask for confirmation.
9. Generate grouping and seating proposal.

### Message format

Store all messages with `role`, `language`, and `text`. The visible UI should render based on `language`, but all downstream AI extraction should convert to structured JSON in a fixed schema.

## Name Matching and Arabic Support

### Critical rule

The system must not freely translate and overwrite names. It must resolve multilingual references to existing guests or groups.

### Strategy

Use three matching stages:

1. Normalization
2. Transliteration heuristics
3. Fuzzy matching

### Normalization rules

Apply to all comparison strings:

1. Trim spaces
2. Collapse repeated spaces
3. Lowercase Latin text
4. Remove punctuation
5. Normalize Arabic letter variants where safe
6. Normalize Hebrew quote and dash variants where safe

### Transliteration rules

Maintain a curated transliteration map between Arabic, Hebrew, and English forms for common names and surnames.

Examples:

1. `محمد` <-> `מוחמד` <-> `Muhammad`, `Mohammad`, `Mohamed`
2. `أحمد` <-> `אחמד` <-> `Ahmed`, `Ahmad`
3. `خطيب` <-> `חטיב` <-> `Khatib`, `Khateeb`

### Matching output format

The name matching service should return a scored set of candidates.

```json
{
  "inputName": "محمد أبو خضير",
  "matches": [
    {
      "entityType": "guest",
      "entityId": "guest_123",
      "displayName": "מוחמד אבו חדיר",
      "confidence": 0.93,
      "matchedBy": ["transliteration", "fuzzy"]
    }
  ]
}
```

### Confidence policy

1. `>= 0.90`: auto-select candidate, still show it in review
2. `0.70 - 0.89`: show top matches and require manager confirmation
3. `< 0.70`: do not attach automatically, mark as unresolved

### Storage policy

Never replace the original guest `name` or `surname` because of Arabic interpretation. Preserve source data and store additional aliases or language variants separately.

## Constraint Extraction

### Constraint types

The assistant should support these core constraint types.

1. `group-together`
2. `keep-apart`
3. `near-table`
4. `near-zone`
5. `avoid-zone`
6. `accessible-seat`
7. `vip-priority`
8. `contiguous-seats-required`
9. `table-reservation`
10. `priority-order`

### Extraction schema

The AI extraction output must always be JSON that conforms to a strict schema.

Example:

```json
{
  "constraints": [
    {
      "type": "group-together",
      "priority": "hard",
      "targetType": "group",
      "targets": [
        { "input": "عائلة الخطيب", "resolvedId": "group_khatib", "confidence": 0.91 }
      ],
      "params": { "requiredSize": 6 },
      "explanation": "Organizer wants the Khatib family seated together."
    }
  ],
  "unresolvedReferences": [
    {
      "input": "أبو سامر",
      "candidateMatches": []
    }
  ]
}
```

### Validation rules

Before saving extracted constraints:

1. Validate schema
2. Validate referenced guest or group IDs
3. Deduplicate near-identical constraints
4. Mark unresolved references for UI review

## Group Suggestion Engine

The assistant should suggest groups from two sources:

1. Existing event data
2. Extracted conversation rules

### Group suggestion inputs

1. Current `Event.groups`
2. Guests with no group
3. Constraints like `group-together`
4. Similar surnames, family relationships, or organizer notes

### Group suggestion outputs

A grouping suggestion should include:

1. Suggested group name
2. Guest IDs
3. Confidence score
4. Reason for grouping
5. Conflicts with existing group assignments

## Seating Planner Engine

### Inputs

1. Event hall layout
2. Guest list
3. Group list
4. Approved planning constraints
5. Existing manual seat assignments

### Processing pipeline

1. Build available seat map
2. Build group blocks
3. Apply hard constraints first
4. Score table candidates for remaining groups and guests
5. Attempt contiguous blocks where required
6. Resolve soft preferences as much as possible
7. Return conflicts for anything unresolved

### Scoring model

Each seat or table candidate gets a weighted score.

Example score factors:

1. Fits required group size
2. Contiguous seats available
3. Accessibility fit
4. Zone preference fit
5. VIP priority fit
6. Avoids separation rule conflicts
7. Keeps families in nearby tables
8. Minimizes movement from existing manual assignments

### Output format

```json
{
  "proposal": {
    "assignments": [
      {
        "guestId": "guest_1",
        "tableId": "table_5",
        "seatId": "seat_2",
        "reason": [
          "Part of group Khatib family",
          "Contiguous seats available",
          "Near entrance requested"
        ],
        "confidence": 0.87
      }
    ],
    "conflicts": [
      {
        "type": "no-contiguous-block",
        "targetId": "group_big_family",
        "message": "No table has 8 contiguous seats available."
      }
    ],
    "unplacedGuests": ["guest_9"]
  }
}
```

## Frontend Design

### New sections in Event Detail

Add these UI blocks to `frontend/src/pages/EventDetail.js`.

1. `AI Planning Assistant`
2. `Planning Constraints`
3. `Reference Matches`
4. `Group Suggestions`
5. `Seating Proposal`
6. `Conflict Review`

### Chat UI requirements

1. Render Arabic, Hebrew, and English correctly
2. Respect RTL for Arabic and Hebrew
3. Keep messages tagged by language
4. Allow copy, edit, and resend

### Constraints UI requirements

1. Show type
2. Show priority
3. Show matched entities
4. Show confidence
5. Allow approve, reject, edit

### Proposal UI requirements

1. Show suggested table and seat
2. Show why it was chosen
3. Show if manual seating would be overwritten
4. Allow apply all, apply selected, reject selected

## Authorization Model

### New permission

Add a new permission:

1. `useAiPlanning`

Recommended access:

1. `admin`: true
2. `manager`: true
3. `escort`: false by default

### Security rules

1. All AI API access must be server-side only
2. LLM secrets must stay in backend env vars
3. Rate limit planning endpoints
4. Log who generated and applied suggestions
5. Validate AI output before persistence

## Backend File Plan

### New files

1. `backend/src/services/aiPlanningService.js`
2. `backend/src/services/planningPromptService.js`
3. `backend/src/services/nameMatchingService.js`
4. `backend/src/services/transliterationService.js`
5. `backend/src/services/seatingPlannerService.js`
6. `backend/src/controllers/planningController.js`
7. `backend/src/utils/planningValidation.js`

### Existing files to update

1. `backend/src/models/Event.js`
2. `backend/src/models/Guest.js`
3. `backend/src/models/User.js`
4. `backend/src/routes/events.js` or a new planning routes file
5. `backend/src/controllers/eventController.js`
6. `backend/src/config/security.js`

## Frontend File Plan

### New files

1. `frontend/src/components/AIPlanningAssistant.js`
2. `frontend/src/components/PlanningConstraintsPanel.js`
3. `frontend/src/components/PlanningMatchesPanel.js`
4. `frontend/src/components/PlanningProposalPanel.js`

### Existing files to update

1. `frontend/src/pages/EventDetail.js`
2. `frontend/src/services/api.js`
3. `frontend/src/contexts/LanguageContext.js`
4. `frontend/src/App.css`

## API Contract Draft

### `GET /api/events/:id/planning`

Returns:

1. conversation
2. constraints
3. suggestions
4. unresolved matches

### `POST /api/events/:id/planning/messages`

Input:

```json
{
  "language": "ar",
  "text": "خلّي أهل العريس مع بعض وقريب على المدخل"
}
```

Response:

```json
{
  "message": {
    "role": "assistant",
    "language": "ar",
    "text": "فهمت. هل تريد أيضاً إبعاد مجموعة معينة عنهم؟"
  }
}
```

### `POST /api/events/:id/planning/extract-constraints`

Response:

1. extracted constraints
2. unresolved references
3. reference matches

### `POST /api/events/:id/planning/generate-seating`

Response:

1. seating proposal
2. conflicts
3. explanations

### `POST /api/events/:id/planning/apply-suggestion`

Input:

```json
{
  "suggestionId": "suggestion_123",
  "applyMode": "selected",
  "selectedAssignmentIds": ["a1", "a2"]
}
```

## LLM Prompting Strategy

### Chat prompt

Purpose:

1. Continue the organizer conversation
2. Ask clarifying questions
3. Keep responses in the organizer's language

### Extraction prompt

Purpose:

1. Convert messages into strict JSON
2. Identify planning constraints
3. Identify unresolved names and references

Rules:

1. Output JSON only
2. Never invent guest IDs
3. Use unresolved references when matching is uncertain

### Proposal explanation prompt

Purpose:

1. Explain seating decisions in simple language
2. Explain why conflicts remain

## Testing Plan

### Unit tests

1. Arabic to Hebrew/English name normalization
2. Fuzzy name matching confidence scoring
3. Constraint schema validation
4. Seating scoring logic
5. Contiguous seat block detection

### Integration tests

1. Chat message persistence
2. Constraint extraction endpoint
3. Match resolution endpoint
4. Seating proposal generation endpoint
5. Apply suggestion endpoint

### Manual QA scenarios

1. Organizer speaks Arabic, guest names exist in Hebrew only
2. Organizer mixes Arabic and English in one message
3. Group name exists in English, organizer references it in Arabic
4. Hard constraint conflict with hall capacity
5. Manager rejects ambiguous name match

## Rollout Plan

### Phase 1: Data and permissions

Deliverables:

1. Event planning fields
2. Guest alias fields
3. New `useAiPlanning` permission

### Phase 2: Chat foundation

Deliverables:

1. Planning conversation persistence
2. Event detail chat UI
3. Arabic, Hebrew, English conversation support

### Phase 3: Reference resolution

Deliverables:

1. Name matching service
2. Match review UI
3. Confirmation workflow

### Phase 4: Constraint extraction

Deliverables:

1. Constraint extraction endpoint
2. Constraint review panel
3. Edit and approval flow

### Phase 5: Group suggestions

Deliverables:

1. Group suggestion engine
2. Apply grouping actions

### Phase 6: Seating proposal

Deliverables:

1. Seating planner service
2. Proposal UI
3. Conflict review
4. Apply selected proposal actions

### Phase 7: Optimization and polish

Deliverables:

1. Better Arabic transliteration coverage
2. Better scoring rules
3. Analytics and planning history

## Risks and Mitigations

### Risk 1: Wrong multilingual name resolution

Mitigation:

1. Use confidence thresholds
2. Require manager confirmation for medium confidence
3. Never overwrite source name fields

### Risk 2: AI invents constraints or entities

Mitigation:

1. Strict schema validation
2. No direct DB writes from raw AI output
3. Unresolved references must stay unresolved until confirmed

### Risk 3: Seating proposals conflict with manual work

Mitigation:

1. Flag assignments that would overwrite manual seating
2. Support partial apply
3. Show explanations before apply

### Risk 4: RTL UI regressions

Mitigation:

1. Reuse existing RTL patterns
2. Test Arabic and Hebrew layouts separately
3. Keep chat and planning panels responsive

## MVP Recommendation

Build this first:

1. Planning conversation storage
2. Arabic, Hebrew, English chat support
3. Name resolution service with review UI
4. Constraint extraction
5. Group suggestion
6. Non-destructive seating proposal

Do not start with fully automatic seating application.

## Success Metrics

1. Percentage of organizer references matched correctly
2. Percentage of extracted constraints approved without edits
3. Percentage of seating proposals partially or fully applied
4. Reduction in manual planning time
5. Reduction in same-day seating changes

## Implementation Order

Recommended build order:

1. Data model changes
2. New permission and backend route scaffolding
3. Planning chat persistence
4. Arabic/Hebrew/English language support in planning UI
5. Name matching service
6. Constraint extraction
7. Group suggestion workflow
8. Seating proposal engine
9. Apply and audit workflow

## Definition of Done

The AI planning bot is considered complete when:

1. Managers can open AI planning inside an event.
2. Organizers can converse in Arabic, Hebrew, or English.
3. The system resolves multilingual guest and group references safely.
4. Constraints can be extracted, reviewed, and approved.
5. The system generates seating proposals using the hall layout.
6. Managers can apply selected suggestions without losing auditability.
7. All AI and planning actions are permission-gated and logged.