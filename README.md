# Sleep Tracker

There are many reasons to track your sleep, this plugin will help you do that with multiple options for capturing your sleep data. Your sleep events can either be captured to your daily journals, or to a dedicated 'Sleep Note'. Sleep data can be captured either manually via a form you fill out, or automatically by syncing with the Google Fit app, which allows capture of data provided by various sleep related apps and devices.  The information captured includes the date and time you went to sleep, woke up, and what the duration of your sleep was.

While primarily designed to capture data into the JOTS framework, this plugin provides customization options to allow its use in almost any setup. 

## Installation

1. Open Settings > Community plugins
2. Click "Turn on community plugins" if you haven't already
3. Click "Browse" and search for "Sleep Tracker"
4. Click "Install"
5. Once installed, close the Community plugins window and activate the plugin

## Configuration

### Enable Google Fit Integration

Note: If you intend to capture your sleep data manually with a form, you can skip this section.

#### Google Project Setup
There's a bit of work you'll have to do in the Google environment to allow us to connect and capture your data. On any of the links below, right-click the link and choose 'Open in new tab' or 'Open in new window' so these instructions can stay open for you.
1. **Create a Google Cloud Project**
    - Open [this link](https://console.cloud.google.com/projectcreate?).
    - Give the project any name you'd like. I called mine 'Obsidian' since I plan on using it for all Obsidian/Google integrations.
    - You can leave 'Location' set to 'No organization'.
    - Click 'Create'
2. **Activate the Fitness API**
    - Here we select which Google products to give this project access to. We only need sleep data, which is part of the Google Fit product, and the tool that gives us access is referred to as 'Fitness API'.
    - Open [this link](https://console.cloud.google.com/apis/api/fitness.googleapis.com) and click 'Enable'
3. **Configure OAUTH**
    - Open [this link](https://console.cloud.google.com/apis/credentials/consent)' for settings related to the 'OAuth consent screen'.
    - Click the 'Get started' button.
    - Enter an 'App name'. I chose 'Obsidian'.
    - Choose your email address from the dropdown
    - Click 'Next'
    - Choose 'External' for our 'Audience' and click 'Next'
    - Enter an email address where you'll get notifications about the project you are creating and click 'Next'
    - Check the box to agree to the Google API Services User Data Policy and click 'Continue'
    - Click 'Create'
    - With the OAuth configuration created, we now need to create the 'OAuth client'. Click the 'Create OAuth client' button under the 'Metrics' heading
    - For 'Application type' choose 'Web application'
    - For 'Name' enter what you'd like, I chose 'Obsidian Web Client'.
    - Under 'Authorized JavaScript origins', click 'Add URI' and add the path `http://localhost:16321`
    - Under 'Authorized redirect URIs', click 'Add URI' and add the path `http://localhost:16321/callback`, then click 'Create'
    - A screen will appear that includes your 'Client ID' and 'Client Secret'. Copy these so we can later enter them into the settings for Sleep Tracker, then click 'OK'.
    - Click on [Audience](https://console.cloud.google.com/auth/audience) in the menu on the left and under the 'Test users' heading click the '+ Add users' button.
    - Enter your email and click Save. This gives your email permission to access your Google Fit data through this project.

#### Sleep Tracker Setup

    1. Enter the 'Client ID' we copied earlier
    2. Enter the 'Client Secret' we copied earlier
    3. Click 'Connect'
    4. In the webpage that opens up, select your account
    5. A page will appear that says "Google hasn't verified this app", click the small 'Continue' link.
    6. Check the 'Select all' box to allow the plugin to access your sleep data through the Google Fit API.
    7. You should see an "Authentication successful! page that you can close.
    8. Return to the plugin Settings Tab and you should see the status has changed from 'Disconnected' to 'Connected'. You're finished integrating Sleep Tracker with Google Fit!

### Enable Journal Entries

If you want to add sleep data to your daily journals, you'll need to enable and configure this section, if not, you can leave it disabled. If enabled, you'll see a number of settings for configuring how sleep data will be entered into your daily journals. Note that these settings determine how the sleep data will appear in your daily journals no matter which method you use to get it there.

The first three settings are for locating your daily journals:

- **Journal Folder**: Specify the root folder where your daily journal are stored. For example, my root folder is `Chrono\Journals`.
- **Journal Subdirectory Format**: Daily Journals are often organized into subdirectories based on date. Specify the structure that your journals are organized by using YMD notation. For example, mine are organized by `YYYY/YYYY-MM` (eg. `2025/2025/04`).
- **Journal Name Format**: How are your daily journal names formatted?  This also uses YMD notation.  For example, mine look like `YYYY-MM-DD_ddd` (eg. `2025-04-17_Thu`).

Once located, the next four are about how the sleep data will appear in your daily journals:

- **Asleep Entry Format**: How should the data for a 'going to sleep' event look? You can use the placeholders `<time>` (eg. 2:00PM) and `<mtime>` (eg. 14:00).  For example, my 'asleep' events look like `(time:: <mtime>) (type:: 💤) Asleep` (notice I put an emoji in there, and I'm using inline fields so I can make this data available to Dataview).
- **Awake Entry Format**: How should the data for a 'waking up' event look? You can use the placeholders `<time>` (eg. `2:00PM`) and `<mtime>` (eg. `14:00`), and `<duration>` (eg. `7.9`).  For example, my 'awake' events look like `(time:: <mtime>) (type::⏰) Awake ((duration:: <duration>) hours of sleep)` (notice I put an emoji in there, and I'm using inline fields so I can make this data available to Dataview).
- **Task Prefix**:  We're using an Obsidian task to display your sleep data, and specifically it's a "Decorated" task, meaning the icon is customized, instead of having a checkbox. To do this, we put a letter in between the `[ ]` brackets instead of leaving it blank (unfinished) or an 'X' (finished). A logical choice might be `s`, short for 'sleep'. In my case, I use `e` since I treat this like an 'event', and it fits along with other events I capture.
- **Task SVG Icon**: To choose your icon, instead of a checkbox, enter any 'Data URI' converted from an SVG Icon. For more information about how to obtain this, visit this article.

### Enable Sleep Note

If you want to add sleep data to a dedicated 'Sleep Note', you'll need to enable and configure this section, if not, you can leave it disabled.  If enabled, you'll see a number of settings for configuring how sleep data will be entered into a 'Sleep Note'. Note that these settings determine how the sleep data will appear in the sleep note no matter which method you use to get it there.

- **Sleep Note Location**: This is the full path to the note, including the note name. For example, my sleep note is located at `Notes/SleepLog.md`. Ideally you should create the note ahead of time and format it as you like. I want my sleep data to appear in a table format, so I start with `| Date | Time | Type | Duration |` followed by `|------|------|------|----------|` on the next line. I then have the sleep data formatted so the entries below this heading will be formatted into a table.
- **Asleep Entry Format**: This is how the sleep data will appear in the sleep note. Available placeholders are `<date>` (eg. `2025-04-17`), `<time>` (eg. `2:00PM`) and `<mtime>` (eg. `14:00`).  For example, mine looks like `| <date> | <time> | 💤 Asleep | |` so it formats into a table. Note that duration is not available for 'Asleep' entries because we don't yet know how long you slept, so in my case, I left a blank column in the table.
- **Awake Entry Format**: This is how the sleep data will appear in the sleep note. Available placeholders are `<date>` (eg. `2025-04-17`), `<time>` (eg. `2:00PM`) and `<mtime>` (eg. `14:00`) and `<duration>` (eg. `7.9`).  For example, mine looks like `| <date> | <time> | ⏰ Awake | <duration> |` so it formats into a table. Note duration is available for 'Awake' since we can calculate the time between the 'Asleep' and 'Awake' events.

## Support

- If you want to report a bug, it would be best to start an **Issue** on the [GitHub page](https://github.com/jpfieber/jots-sleep-tracker/issues).
- If you'd like to discuss how the plugin works, the best place would be the [JOTS SubReddit](https://www.reddit.com/r/Jots/)

## JOTS

While this plugin works on it's own in most any vault, it is part of a larger system called <a href="https://jots.life">JOTS: Joe's Obsidian Tracking System</a>. Learn more about it <a href="https://jots.life">here</a>.

![JOTS-Logo-64](https://github.com/user-attachments/assets/e29ba5d7-8bdd-4cd9-8336-5fa35b7b593e)

## Support My Work

If this plugin helped you and you wish to contribute:

<a href="https://www.buymeacoffee.com/jpfieber" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="60"></a>

- <a href="https://github.com/sponsors/jpfieber">GitHub Sponsor</a>
- <a href="https://www.paypal.com/paypalme/jpfieber">PayPal</a>

Your support helps maintain and improve this project. Thank you!