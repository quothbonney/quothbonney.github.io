# Student Router - Deployment Instructions

## Overview
Student Router is a lightweight course section assignment system with a static GitHub Pages frontend and Google Apps Script backend.

## Setup Instructions

### 1. Google Sheets & Apps Script Setup

1. **Create a new Google Sheet**
   - Go to sheets.google.com
   - Create a new blank spreadsheet
   - Name it "Course Student Router" (or similar)

2. **Set up Apps Script**
   - In the Google Sheet, go to Extensions → Apps Script
   - Delete any existing code
   - Copy the entire contents of `apps-script.gs` into the editor
   - Save the project with a name like "Student Router Backend"

3. **Configure the script (optional)**
   - Edit the configuration section at the top of the script:
     - `BEARER_TOKEN`: Add a token for basic security (optional)
     - `ALLOWED_IDS`: Add an array of whitelisted student IDs (optional)

4. **Deploy as Web App**
   - Click "Deploy" → "New Deployment"
   - Choose type: "Web app"
   - Settings:
     - Description: "Student Router API"
     - Execute as: "Me"
     - Who has access: "Anyone" (required for anonymous access)
   - Click "Deploy"
   - **IMPORTANT**: Copy the Web App URL - you'll need this!

### 2. GitHub Pages Setup

1. **Update API URLs**
   - Edit `assets/app.js` and `assets/admin.js`
   - Replace `YOUR_APPS_SCRIPT_URL_HERE` with your actual Web App URL from step 1.4

2. **Customize schedule and times**
   - Edit `assets/schedule.json` with your actual class times and capacities
   - Edit `assets/copy.json` to customize UI text if needed

3. **Deploy to GitHub Pages**
   - Commit all files to your GitHub repository
   - The files should be in `/student-router/` subdirectory
   - Your site structure:
     ```
     /student-router/
       index.html          # Student registration form
       admin.html          # Admin dashboard
       /assets/
         app.js            # Student form logic
         admin.js          # Admin dashboard logic
         styles.css        # Styles
         schedule.json     # Schedule configuration
         copy.json         # UI text
     ```

4. **Access the application**
   - Student registration: `https://[your-username].github.io/student-router/`
   - Admin dashboard: `https://[your-username].github.io/student-router/admin.html`

## Usage

### For Students
1. Navigate to the main page
2. Enter student ID, name, and email
3. Select availability for:
   - At least one class section
   - At least one recitation from Day A (Tuesday)
   - At least one recitation from Day B (Thursday)
   - At least one TA section
4. Submit to receive assigned sections

### For Administrators
1. Navigate to `/admin.html`
2. View real-time capacity bars for all sections
3. Search and filter the student roster
4. Export roster as CSV
5. For manual overrides:
   - Open the Google Sheet directly
   - Edit assignments in the appropriate columns
   - Set "Locked" to TRUE to prevent automatic reassignment

## Testing

### Basic Functionality Test
1. Submit a test registration with all options selected
2. Verify assignment appears and is balanced
3. Resubmit with different availability to test reassignment
4. Check admin dashboard shows correct counts

### Load Test
1. Open multiple browser tabs
2. Submit registrations simultaneously
3. Verify no duplicate entries and correct count increments

### Constraint Test
1. Submit with only Day A recitations (should be blocked)
2. Fill sections to capacity and test overflow behavior

## Security Notes

- The Apps Script URL is visible in client-side code
- Optional bearer token provides basic protection against automated abuse
- For production use with sensitive data, consider:
  - Implementing proper authentication
  - Using ID whitelist feature
  - Restricting Apps Script access to domain users

## Troubleshooting

### "Failed to load configuration"
- Check that `schedule.json` and `copy.json` are accessible
- Verify correct file paths in the JavaScript files

### "Registration failed"
- Verify the Apps Script URL is correct in both JS files
- Check Apps Script deployment settings (must be "Anyone" for access)
- Look for errors in browser console (F12)

### Admin dashboard not loading data
- Verify Apps Script is deployed and accessible
- Check CORS is enabled in Apps Script (included in provided code)
- Ensure the Google Sheet has proper permissions

## Maintenance

### Updating Schedule/Capacities
1. Edit `assets/schedule.json`
2. Update the matching configuration in `apps-script.gs`
3. Redeploy the Apps Script if changed
4. Commit and push changes to GitHub

### Manual Data Management
- Open the Google Sheet directly to:
  - View raw data
  - Make manual assignments
  - Lock specific students
  - Add admin notes
  - Delete entries if needed

### Clearing Data for New Semester
1. Open the Google Sheet
2. Delete all rows except the header
3. Or rename/archive the sheet and let the script create a new one