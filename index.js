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
  console.log("====동작함====");
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
        type: "스프레드 시트",
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

    //스프레드의 데이터 하나가 이벤트데이터들에 있는지 반복해서 찾는다.
    //있다. -> 같은 날짜가 있으면 summary가 같은지 확인한다.
    //--같다.--> 같으면 그냥 넘김.
    //--다르다.-->그러면 업데이트 해야함.
    //없다. -> 그러면 그냥 insert 이벤트 하기.

    for (let i in spread_list) {
      let spreadsheet_date = spread_list[i].start.toString(); //스프레드시트 첫번째 인덱스의 날짜가 나옴
      let days = parseInt(spreadsheet_date.slice(-2)); //몇일인지 숫자 값으로 나옴

      setTimeout(() => {
        if (days <= 31) {
          checkEventExist(auth, spreadsheet_date).then((result) => {
            //날짜값과 일치하는 날짜의 이벤트가 있는지 확인

            //해당 날짜에 이벤트가 있다. 없다.
            let res;
            if (result.length == 0) {
              res = false;
            } else {
              res = true;
            }

            if (res) {
              //console.log("이 날짜에는 이벤트가 존재합니다.");

              //summary가 같은지 확인한다.
              let spread_summary = spread_list[i].summary;
              let event_summary = result[0].summary;
              if (spread_summary === event_summary) {
              } else {
                if (spread_summary === "" || spread_summary === undefined) {
                  //해당 날짜의 이벤트를 삭제하기
                  let date = spread_list[i].start;
                  checkEventExist(auth, date).then(async (events) => {
                    const calendar = google.calendar({ version: "v3", auth });
                    //console.log(events[0]);
                    // await calendar.events.delete({
                    //   calendarId: "primary", // 이벤트가 있는 캘린더의 ID
                    //   eventId: events[0].id,
                    //   auth: auth,
                    // });
                  });
                } else {
                  //같지 않을 경우
                  let obj = {
                    start: spread_list[i].start,
                    eventId: result[0].id,
                  };
                  updateEvent(auth, obj, spread_list[i].summary);
                }
              }
            } else {
              //console.log("이 날짜에는 이벤트가 존재하지 않습니다.");
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
      type: "구글 이벤트",
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
  //date는 '2023-02-01' 이런 형식이어야 함.

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
  console.log("============== updateEvent : 동작 ==================");
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
