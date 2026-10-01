# Digi Campus Comprehensive Knowledge Base & University Regulations

## 1. Academic & Attendance Framework

### 1.1 Minimum Attendance Rules & Thresholds

* **Mandatory Threshold:** Every student must maintain a minimum of **75% overall attendance** across all lectures, tutorials, and practical lab sessions for each registered course in a semester.

* **Condonation Band (65.0% - 74.9%):**

  * Attendance within this range may be condoned solely on valid medical grounds (certified by a registered medical practitioner) or official representation of the university in sports, cultural, or academic events.

  * *Required Action:* Condonation forms must be submitted via the Digi Campus App within 5 business days of returning to class, accompanied by verified medical certificates or event duty slips.

* **Critical Attendance Deficit (< 65.0%):**

  * Students falling below 65% attendance are automatically barred from sitting for the End-Semester Examination in that course.

  * The student will receive an **F-Repeat (FR)** grade and must re-register for the entire course in a subsequent semester.

* **Automated Early Warning Notification Engine:**

  * **Level 1 Alert (78% Attendance):** In-app notification warning sent to the student.

  * **Level 2 Alert (< 75% Attendance):** High-priority push notification sent to student app + automated SMS dispatched to registered parent/guardian mobile number.

  * **Level 3 Alert (< 65% Attendance):** Official lock placed on exam hall ticket generation; notification escalated to Faculty Advisor and HOD.

### 1.2 Grading System & Academic Standing

* Performance is evaluated on a 10-point relative grading scale:

  | **Letter Grade** | **Performance Grade Point** | **Score Range Equivalent** | **Description** | 
  | **O** | 10.0 | $\ge 90\%$ | Outstanding | 
  | **A+** | 9.0 | $80\% - 89\%$ | Excellent | 
  | **A** | 8.0 | $70\% - 79\%$ | Very Good | 
  | **B+** | 7.0 | $60\% - 69\%$ | Good | 
  | **B** | 6.0 | $55\% - 59\%$ | Above Average | 
  | **C** | 5.0 | $50\% - 54\%$ | Average | 
  | **P** | 4.0 | $40\% - 49\%$ | Pass | 
  | **F** | 0.0 | $< 40\%$ | Fail | 

* **Passing Criterion:** Students must secure a minimum of 40% in Continuous Internal Evaluation (CIE) and 40% in the End-Semester Examination (ESE) independently to earn a passing grade.

* **Semester Grade Point Average (SGPA) Formula:**
  

  $$
  \text{SGPA} = \frac{\sum (C_i \times G_i)}{\sum C_i}
  $$

  
  *Where* $C_i$ *is the course credit and* $G_i$ *is the grade point earned.*

## 2. AI Hostel Room Allocation & Roommate Matching System

### 2.1 Hostel Preference Form Submission

* At the beginning of each academic year or hostel allotment cycle, eligible students complete an in-app **Hostel Preference Profile Form**.

* **Required Input Parameters:**

  1. **Academic Metadata:** Course (e.g., B.Tech, M.Tech, MBA), Academic Year / Semester, Branch.

  2. **Sleep Schedule Profile:**

     * *Night Owl* (Sleeps after 2:00 AM) vs. *Early Riser* (Wakes before 6:00 AM)

     * Sleep light tolerance (Light sleeper vs. Heavy sleeper)

     * Night study preference (Desk lamp allowed vs. Total darkness required)

  3. **Lifestyle & Habits:**

     * Cleanliness / Organization scale (1 = Casual, 5 = Strict Minimalist/Clean)

     * Room visitor preference (Quiet zone vs. Social hub)

     * AC / Temperature preference ($18^\circ\text{C} - 22^\circ\text{C}$ vs. $23^\circ\text{C} - 26^\circ\text{C}$)

  4. **Personal Interests & Hobbies:**

     * Competitive Coding, Robotics, Fine Arts, Music, Gaming, Sports, Literature, Entrepreneurship.

### 2.2 AI Roommate Compatibility Algorithm Logic

* The backend AI engine runs a multi-factor compatibility scoring model (`0.0` to `1.0` or `0%` to `100%`) when pairing students for double or triple occupancy rooms:

  * **Hard Constraint Filter (Weight: 100% - Binary Filter):**

    * Must belong to the same gender classification and compatible academic year groups (e.g., Freshmen paired with Freshmen; Seniors paired with Seniors).

  * **Sleep Schedule Vector Similarity (Weight: 40%):**

    * Calculates cosine similarity between sleep/wake times and night study habits. High similarity prevents sleep disruption.

  * **Lifestyle Compatibility Index (Weight: 30%):**

    * Evaluates temperature preference, noise tolerance, and cleanliness ratings to minimize daily friction.

  * **Interest Clustering Score (Weight: 30%):**

    * Embeds interest tags using text vectorization to pair students with complementary or shared academic/extracurricular pursuits (e.g., pairing two competitive coders or sports enthusiasts).

* **Ranked Output:** The AI engine outputs a prioritized **Roommate Compatibility Ranking List** for each applicant. Students can review their top matched roommate options and accept mutual pairings prior to room number confirmation.

## 3. Examination Rules & Seating Allocation Algorithm

### 3.1 Examination Conduct & Digital Entry

* **Dynamic QR Gate Verification:** Students must display their dynamic, time-sensitive Digi Campus Pass (refreshed every 30 seconds) on their mobile app at turnstiles to enter the examination center.

* **Prohibited Items:** Smartwatches, cellular devices, programmable calculators, and unauthorized printed materials are strictly forbidden. Any violation results in immediate expulsion under Malpractice Rules (Unfair Means - UFM Policy).

### 3.2 Automated Anti-Collusion Seating Allocation Logic

* The system utilizes a multi-branch interleaving algorithm (`POST /api/admin/generate-seating`) to configure seating arrangements:

  * **Adjacent Branch Rule:** No two students seated adjacent to each other (left, right, directly front, directly back) may belong to the same department or academic program.

  * **Matrix Fill Algorithm:** The seating solver alternates student branches ($B_1, B_2, B_3, \dots, B_n$) across examination grid rows and columns to prevent collusion or cheating.

## 4. Administrative Workflow Engine & Dynamic Approvals

### 4.1 Multi-Stage Application Routing Engine

Applications for Leave, Bonafide Certificates, Hostel Change Requests, and Course Drop/Add are automatically routed through dynamic multi-tier authorization channels:

```
[Student Submission]
         │
         ▼
 ┌───────────────┐
 │ Stage 1:      │  (Faculty Advisor / Warden)
 │ Initial Check │  -> Review within 24 Hours
 └───────┬───────┘
         │ (Approved)
         ▼
 ┌───────────────┐
 │ Stage 2:      │  (Head of Department - HOD)
 │ Department    │  -> Verification within 48 Hours
 └───────┬───────┘
         │ (Approved)
         ▼
 ┌───────────────┐
 │ Stage 3:      │  (Dean of Academic / Student Affairs)
 │ Final Sanction│  -> Final Digital Signature & Approval
 └───────────────┘

```

* **Automated Escalation Timeout:** If an application remains pending at any stage for over 48 hours without action, an automated alert escalates the request to the next administrative tier with an urgent badge.

## 5. AI Career, Placement & Resume Acceleration Rules

### 5.1 On-Campus Placement Drive Eligibility

* **Academic Threshold:** Minimum CGPA of **6.50** with no active backlogs at the time of drive registration.

* **Resume AI Audit Requirement:** All uploaded resumes must achieve an **AI ATS Score** $\ge 75\%$ generated by the Digi Campus AI Resume Advisor. Resumes flagged with formatting errors or key skill omissions must be updated prior to company application deadlines.

### 5.2 One-Student-One-Job ("Dream Offer") Policy

* Once a student secures a job offer through campus recruitment, they are marked as **Placed** and locked from attending further campus placement drives.

* **Exception ("Dream Offer"):** A student may opt to participate in additional drives only if the recruiting company offers a compensation package at least **1.5x (150%)** higher than the current offer held by the student.