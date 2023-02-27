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

    //스프레드 시트의 데이터 갯수만큼 반복한다.
    for (let i in spread_list) {
      setTimeout(() => {
        //이벤트의 데이터가 0이 아닐때
        if (event_list.length != 0) {
          //이벤트 갯수만큼 반복한다.
          for (let j in event_list) {
            //스프레드의 데이터 하나가 이벤트 데이터 하나의 날짜가 같을때
            if (spread_list[i].start === event_list[j].start) {
              //스프레드의 데이터의 내용과 이벤트 데이터의 내용과 같을때
              if (spread_list[i].summary.toString() === event_list[j].summary.toString()) {
                console.log("========================================================같은 내용의 이벤트 입니다.");
                console.log(spread_list[i].summary.toString());
                console.log(event_list[j].summary.toString());
              } else {
                console.log("spread_list - summary : ", spread_list[i].summary);
                console.log("event_list - summary : ", event_list[j].summary);

                let obj = {
                  start: spread_list[i].start,
                  eventId: event_list[j].eventId,
                };
                updateEvent(auth, obj, spread_list[i].summary);
              }
            }
            //if (spread_list[i].start !== event_list[j].start && spread_list[i].summary !== "")
            else {
              //같은 날짜의 데이터가 없음
              let obj = {
                summary: spread_list[i].summary,
                date: spread_list[i].start,
              };

              // if (spread_list[i].summary.toString() !== event_list[j].summary.toString()) {
              //   // console.log("여기에서 이벤트 넣는거 실행해야 하는데???");
              //   // addEvent(auth, obj);
              // }
            }
          }
        } else {
          //스프레드에 있는 데이터 모두 넣기
          console.log("스프레드에 있는 데이터 모두 넣기 : ", i);
        }
      }, 2000);
    }
  }, 3000);
}
console.log("=================================================================================================");
authorize().then(processing).catch(console.error);

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
  return event_arr;
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
  console.log("updateEvent : 동작 ==================");
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
    // allDay 속성 추가
    allDay: true,
  };

  await calendar.events.update({
    calendarId: "primary",
    eventId: obj.eventId,
    resource: event,
  });
}
