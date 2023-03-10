const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");
const axios = require("axios");

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");
/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/* 
  ===================================================================================================
  ===================================================================================================
  ===================================================================================================
  ===================================================================================================
*/

async function authorize() {
  let auth_obj = {
    client: "",
    a: "a",
  };

  auth_obj.client = await loadSavedCredentialsIfExist();
  if (auth_obj.client) {
    return auth_obj;
  }
  auth_obj.client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (auth_obj.client.credentials) {
    await saveCredentials(auth_obj.client);
  }
  return auth_obj;
}

/**
 * Lists the next 10 events on the user's primary calendar.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */

async function processing(auth_obj) {
  console.log("====?????????====");
  let auth = auth_obj.client;

  let event_list;

  listEvents(auth).then((li) => {
    event_list = li;
  });

  let spread_list = [];
  axios.get("https://schedule-ing.vercel.app/api/schedules/this-month").then((res) => {
    let data = res.data.schedules;

    let year = new Date().getFullYear().toString();
    let month = getMonth();

    data.map((summary, i) => {
      let days;
      let num = i + 1;
      if (num < 10) {
        days = "0" + num.toString();
      } else {
        days = num.toString();
      }

      let obj = {
        type: "???????????? ??????",
        summary: summary,
        start: `${year}-${month}-${days}`,
        end: `${year}-${month}-${days}`,
      };
      spread_list.push(obj);
    });
  });

  setTimeout(() => {
    //console.log(event_list[0]);
    //console.log(spread_list[0]);

    //================================= Ver.2 ===============================================================

    //??????????????? ????????? ????????? ???????????????????????? ????????? ???????????? ?????????.
    //??????. -> ?????? ????????? ????????? summary??? ????????? ????????????.
    //--??????.--> ????????? ?????? ??????.
    //--?????????.-->????????? ???????????? ?????????.
    //??????. -> ????????? ?????? insert ????????? ??????.

    for (let i in spread_list) {
      let spreadsheet_date = spread_list[i].start.toString(); //?????????????????? ????????? ???????????? ????????? ??????
      let days = parseInt(spreadsheet_date.slice(-2)); //???????????? ?????? ????????? ??????

      setTimeout(() => {
        if (days <= 31) {
          checkEventExist(auth, spreadsheet_date).then((result) => {
            //???????????? ???????????? ????????? ???????????? ????????? ??????

            //?????? ????????? ???????????? ??????. ??????.
            let res;
            if (result.length == 0) {
              res = false;
            } else {
              res = true;
            }

            if (res) {
              //console.log("??? ???????????? ???????????? ???????????????.");

              //summary??? ????????? ????????????.
              let spread_summary = spread_list[i].summary;
              let event_summary = result[0].summary;
              if (spread_summary === event_summary) {
              } else {
                if (spread_summary === "" || spread_summary === undefined) {
                  //?????? ????????? ???????????? ????????????
                  let date = spread_list[i].start;
                  console.log(date);
                  const calendar = google.calendar({ version: "v3", auth });

                  calendar.events
                    .list({
                      calendarId: "primary",
                      timeMin: `${date}T00:00:00Z`,
                      timeMax: `${date}T23:59:59Z`,
                    })
                    .then(function (response) {
                      var events = response.data.items;
                      for (var i = 0; i < events.length; i++) {
                        var event = events[i];
                        calendar.events
                          .delete({
                            calendarId: "primary",
                            eventId: event.id,
                          })
                          .then(
                            function (response) {
                              console.log("Event deleted: " + event.summary);
                            },
                            function (error) {
                              console.error("Error deleting event: " + error);
                            }
                          );
                      }
                    });
                } else {
                  //?????? ?????? ??????
                  let obj = {
                    start: spread_list[i].start,
                    eventId: result[0].id,
                  };
                  updateEvent(auth, obj, spread_list[i].summary);
                }
              }
            } else {
              //console.log("??? ???????????? ???????????? ???????????? ????????????.");
              let obj = {
                date: spread_list[i].start,
                summary: spread_list[i].summary,
              };
              if (spread_list[i].summary !== "") {
                addEvent(auth, obj);
              }
            }
          });
        }
      }, i * 1000);
    }
  }, 3000);
}
console.log("=================================================================================================");
let num = 1;
setInterval(() => {
  authorize().then(processing).catch(console.error);
  console.log(num);
  num++;
}, 10000);

//====================================================================//====================================================================
//====================================================================//====================================================================

async function listEvents(auth) {
  const calendar = google.calendar({ version: "v3", auth });

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: new Date("2023-02-01").toISOString(),
    maxResults: 10,
    singleEvents: true,
    orderBy: "startTime",
  });

  const events = res.data.items;
  let event_arr = [];
  if (!events || events.length === 0) {
    console.log("No upcoming events found.");
    return event_arr;
  }

  events.map((event, i) => {
    const start = event.start.dateTime || event.start.date;
    const end = event.end.dateTime || event.end.date;
    const summary = event.summary;
    const eventId = event.id;
    let obj = {
      type: "?????? ?????????",
      start: start,
      end: end,
      summary: summary,
      eventId: eventId,
    };
    event_arr.push(obj);
  });
  return event_arr;
}

async function checkEventExist(auth, date) {
  //date??? '2023-02-01' ?????? ??????????????? ???.

  const calendar = google.calendar({ version: "v3", auth });

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
  });

  const events = response.data.items;
  return events;
}

function getMonth() {
  let month_ = new Date().getMonth() + 1;
  if (month_.toString().length == 1) {
    return "0" + month_.toString();
  } else {
    return month_;
  }
}

async function addEvent(auth, obj) {
  const calendar = google.calendar({ version: "v3", auth });

  let date = obj.date;
  let summary = obj.summary;

  const eventDate = new Date(date);

  const event = {
    summary: summary,
    start: {
      date: eventDate.toISOString().slice(0, 10),
      timeZone: "Asia/Seoul",
    },
    end: {
      date: eventDate.toISOString().slice(0, 10),
      timeZone: "Asia/Seoul",
    },
    allDay: true,
  };

  calendar.events.insert(
    {
      auth: auth,
      calendarId: "primary",
      resource: event,
    },
    function (err, event) {
      if (err) {
        console.log("There was an error contacting the Calendar service: " + err);
        return;
      }
      console.log("Event created: %s", event.data.summary);
    }
  );
}

async function updateEvent(auth, obj, get_summary) {
  console.log("============== updateEvent : ?????? ==================");
  const calendar = google.calendar({ version: "v3", auth });

  let date = obj.start;
  let summary = get_summary;
  const eventDate = new Date(date);

  const event = {
    summary: `${summary}`,
    start: {
      date: eventDate.toISOString().slice(0, 10),
      timeZone: "Asia/Seoul",
    },
    end: {
      date: eventDate.toISOString().slice(0, 10),
      timeZone: "Asia/Seoul",
    },
    // allDay ?????? ??????
    allDay: true,
  };

  await calendar.events.update({
    calendarId: "primary",
    eventId: obj.eventId,
    resource: event,
  });
}
