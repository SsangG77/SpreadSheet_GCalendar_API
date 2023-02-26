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

/**
 * Load or request or authorization to call APIs.
 *
 */

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
  let auth = auth_obj.client;

  let event_list;

  listEvents(auth).then((li) => {
    event_list = li;
  });

  let spread_list = [];
  axios.get("https://schedule-ing.vercel.app/api/schedules/this-month").then((res) => {
    let data = res.data.schedules;

    function getMonth() {
      let month_ = new Date().getMonth() + 1;
      if (month_.toString().length == 1) {
        return "0" + month_.toString();
      } else {
        return month_;
      }
    }
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
        summary: summary,
        start: `${year}-${month}-${days}`,
        end: `${year}-${month}-${days}`,
      };
      spread_list.push(obj);
    });
  });

  setTimeout(() => {
    console.log(event_list[0]);
    console.log(spread_list[0]);

    //스프레드의 데이터 하나가 이벤트데이터들에 있는지 반복해서 찾는다.
    //있다. -> 같은 날짜가 있으면 summary가 같은지 확인한다.
    //--같다.--> 같으면 그냥 넘김.
    //--다르다.-->그러면 업데이트 해야함.
    //없다. -> 그러면 그냥 insert 이벤트 하기.

    for (let i in spread_list) {
      if (event_list.length != 0) {
        for (let j in event_list) {
          if (spread_list[i].start === event_list[j].start) {
            console.log("같은 날짜의 데이터가 있음. ========== o");
            if (spread_list[i].summary !== event_list[j].summary) {
              console.log("spread_list - summary : ", spread_list[i].summary);
              console.log("event_list - summary : ", event_list[j].summary);

              let obj = {
                start: spread_list[i].start,
                eventId: event_list[j].eventId,
              };
              updateEvent(auth, obj, spread_list[i].summary);
            }
          } else {
            //같은 날짜의 데이터가 없음
            let obj = {
              summary: spread_list[i].summary,
              date: spread_list[i].start,
            };
            if (spread_list[i].summary !== "") {
              setTimeout(() => {
                if (spread_list[i].summary !== event_list[j].summary) {
                  addEvent(auth, obj);
                }
              }, 1000);
            }
          }
        }
      } else {
        //스프레드에 있는 데이터 모두 넣기
        console.log("스프레드에 있는 데이터 모두 넣기 : ", i);
      }
    }
  }, 3000);

  obj = {
    summary: "test0",
    date: "2023-02-4",
  };

  //addEvent(auth, obj);
}
console.log("=============================================================================");
authorize().then(processing).catch(console.error);
//getSpreadData();

//====================================================================//====================================================================
//====================================================================//====================================================================

async function listEvents(auth) {
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: new Date("2023-01-01").toISOString(),
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
      start: start,
      end: end,
      summary: summary,
      eventId: eventId,
    };
    event_arr.push(obj);
    //console.log(`${start} - ${end} - ${event.summary}`);
  });
  //console.log(event_arr);
  return event_arr;
}

async function addEvent(auth, obj) {
  const calendar = google.calendar({ version: "v3", auth });

  console.log("addEvent : 동작 =========================");

  let date = obj.date;
  let summary = obj.summary;

  const eventDate = new Date(date);

  const event = {
    summary: summary, // 이벤트 제목
    start: {
      date: eventDate.toISOString().slice(0, 10), // 이벤트 시작 날짜 (YYYY-MM-DD 형식)
      timeZone: "Asia/Seoul", // 이벤트 시간대
    },
    end: {
      date: eventDate.toISOString().slice(0, 10), // 이벤트 종료 날짜 (YYYY-MM-DD 형식)
      timeZone: "Asia/Seoul", // 이벤트 시간대
    },
    // allDay 속성 추가
    allDay: true,
  };

  // const event = {
  //   summary: obj.summary,
  //   start: {
  //     dateTime: eventDate.toISOString().slice(0, 10),
  //     timeZone: "Asia/Seoul",
  //   },
  //   end: {
  //     dateTime: eventDate.toISOString().slice(0, 10),
  //     timeZone: "Asia/Seoul",
  //   },
  //   allDay: true,
  // };
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
      console.log("Event created: %s", event.htmlLink);
    }
  );
}

async function updateEvent(auth, obj, get_summary) {
  console.log("updateEvent : 동작 ==================");
  const calendar = google.calendar({ version: "v3", auth });

  let date = obj.start; // "2023-02-02"
  let summary = get_summary;
  const eventDate = new Date(date);

  const event = {
    summary: `${summary}`,
    start: {
      date: eventDate.toISOString().slice(0, 10), // 이벤트 시작 날짜 (YYYY-MM-DD 형식)
      timeZone: "Asia/Seoul", // 이벤트 시간대
    },
    end: {
      date: eventDate.toISOString().slice(0, 10), // 이벤트 종료 날짜 (YYYY-MM-DD 형식)
      timeZone: "Asia/Seoul", // 이벤트 시간대
    },
    // allDay 속성 추가
    allDay: true,
    // recurrence: ["RRULE:FREQ=DAILY;COUNT=2"],
    // attendees: [{ email: "lpage@example.com" }, { email: "sbrin@example.com" }],
    // reminders: {
    //   useDefault: false,
    //   overrides: [
    //     { method: "email", minutes: 24 * 60 },
    //     { method: "popup", minutes: 10 },
    //   ],
    // },
  };

  await calendar.events.update({
    calendarId: "primary",
    eventId: obj.eventId,
    resource: event,
  });
}