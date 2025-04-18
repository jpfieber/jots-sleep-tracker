# Sleep Tracker

There are many reasons to track your sleep, this plugin will help you do that with multiple options for capturing your sleep data. Your sleep events can either be captured to your daily journals, or to a dedicated 'Sleep Note'. Sleep data can be captured either manually via a form you fill out, or automatically by syncing with the Google Fit app, which allows capture of data provided by various sleep related apps and devices.  The information captured includes the date and time you went to sleep, woke up, and what the duration of your sleep was.

While primarily designed to capture data into the JOTS framework, this plugin provides customization options to allow its use in almost any system. 

## Installation

### From within Obsidian

1. Open Settings > Community plugins
2. Click "Turn on community plugins" if you haven't already
3. Click "Browse" and search for "Sleep Tracker"
4. Click "Install"
5. Once installed, close the Community plugins window and activate the plugin

### Manual installation

1. Download the latest release from the [GitHub releases page](https://github.com/jpfieber/jots-sleep-tracker/releases)
2. Extract the zip archive into your Obsidian vault's `.obsidian/plugins` folder
3. Reload Obsidian
4. Enable the plugin in Settings > Community plugins

## Configuration

### Enable Google Fit Integration

Note: If you intend to capture your sleep data manually with a form, you can skip this step.
There's a bit of work you'll have to do in the Google environment to allow us to connect and capture your data.
1. Create Google Cloud Project
2. Activate Google Tasks API
3. Configure OAUTH screen
    - Select Extern
    - Fill necessary inputs
    - Add your email as tester if using "@gmail" add gmail and googlemail
    - Add API Token
4. Add OAUTH client
    - select Webclient
    - add http://127.0.0.1:42813 as Javascript origin
    - add http://127.0.0.1:42813/callback as redirect URI

Once that's done, we'll need to add two pieces of information to the plugin settings:
1. Client ID
2. Client Secret

With that information provided, click the 'Connect' button and you should see a webpage open in your web browser and show a message that the connection was successful, followed by the status in the plugin settings changeing to 'Connected' with the button changing from 'Connect' to 'Disconnect', and a Manual Data Sync section becoming visible.  If all that happens, you've successfully enabled the Google Fit integration!

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
