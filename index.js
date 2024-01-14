// const express = require('express');
// const app = express();
// const port = 8000;
// const path = require("path");
// const fs = require("fs").promises;
// const { authenticate } = require("@google-cloud/local-auth");
// const { google } = require("googleapis");

// const SCOPES = [
//     "https://www.googleapis.com/auth/gmail.readonly",
//     "https://www.googleapis.com/auth/gmail.send",
//     "https://www.googleapis.com/auth/gmail.labels",
//     "https://mail.google.com/",
//   ];

//   app.get("/", async (req, res) => { 
//     const credentials = await fs.readFile('credentials.json');
//     const auth = await authenticate({
//         keyfilePath: path.join(__dirname, "credentials.json"),
//     scopes: SCOPES,
//   });
//   console.log("this is auth",auth);

//   const gmail = google.gmail({ version: "v1", auth });

//   const response = await gmail.users.labels.list({
//     userId: "me",
//   });

//   const LABEL_NAME = 'Vacation';

//   async function loadCredentials(){
//     const filePath = path.basename(process.cwd(), 'credentials.json');
//     const content = await fs.readFile(filePath, {encoding: 'utf-8'});
//     return JSON.parse(content);
//   }

// //   unreply msgs
//   async function getUnrepliesMessages(auth) {
//     const gmail = google.gmail({ version: "v1", auth });
//     const response = await gmail.users.messages.list({
//       userId: "me",
//     //   labelIds: ["INBOX"],
//       q: "-in:chats -from:me -has:userlabels",
//     });
//     return response.data.messages || [];
//   }

// //   send reply
//   async function sendReply(auth, messages){
//     const gmail = google.gmail({ version: "v1", auth });
//     const res = await gmail.users.messages.get({
//         userId: 'me',
//         id: message.id,
//         format: 'metadata',
//         metadataHeaders: ['Subject', 'From'],
//     });

//     const Subject = res.data.payload.headers.find(
//         (header) => header.name === 'Subject'
//     ).value;
//     const from = res.data.payload.headers.find(
//         (header) => header.name === 'From'
//     ).value;

//     const replyTo = from.match(/<{.*}>/)[1];
//     const replySubject = Subject.startsWith('Re:') ? Subject : `Re: ${Subject}`;
//     const replyBody = `Hi,\n\nI'm currently on vacation and will get back to you soon.\n\nRegards,\n\n Bhushan Kher.`

//     const rawMessage = [
//         `From: me`,
//         `To: ${replyTo}`,
//         `Subject: ${replySubject}`,
//         'In-Reply-To: ${message.id}',
//         'Refrences: ${message.id}',
//         '',
//         replyBody,
//     ].join('\n');


//   }


//     })

const express = require("express");
const app = express();
const path = require("path");
const { authenticate } = require("@google-cloud/local-auth");
const fs = require("fs").promises;
const { google } = require("googleapis");


// these are the scope that we want to access 
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://mail.google.com/",
];

// i kept the label name
const labelName = "Vacation Auto-Reply";


app.get("/", async (req, res) => {

  // here i am taking google GMAIL  authentication 
  const auth = await authenticate({
    keyfilePath: path.join(__dirname, "credentials.json"),
    scopes: SCOPES,
  });

  // console.log("this is auth",auth)

  // here i getting authorize gmail id
  const gmail = google.gmail({ version: "v1", auth });


  //  here i am finding all the labels availeble on current gmail
  const response = await gmail.users.labels.list({
    userId: "me",
  });


  //  this function is finding all email that have unreplied or unseen
  async function getUnrepliesMessages(auth) {
    const gmail = google.gmail({ version: "v1", auth });
    const response = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["INBOX"],
      q: "is:unread",
    });
    
    return response.data.messages || [];
  }

  //  this function generating the label ID
  async function createLabel(auth) {
    const gmail = google.gmail({ version: "v1", auth });
    try {
      const response = await gmail.users.labels.create({
        userId: "me",
        requestBody: {
          name: labelName,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        },
      });
      return response.data.id;
    } catch (error) {
      if (error.code === 409) {
        const response = await gmail.users.labels.list({
          userId: "me",
        });
        const label = response.data.labels.find(
          (label) => label.name === labelName
        );
        return label.id;
      } else {
        throw error;
      }
    }
  }

  async function main() {
    // Create a label for theApp
    const labelId = await createLabel(auth);
    // console.log(`Label  ${labelId}`);
    // Repeat  in Random intervals
    setInterval(async () => {
      //Get messages that have no prior reply
      const messages = await getUnrepliesMessages(auth);
      // console.log("Unreply messages", messages);

      //  Here i am checking is there any gmail that did not get reply
      if (messages && messages.length > 0) {
        for (const message of messages) {
          const messageData = await gmail.users.messages.get({
            auth,
            userId: "me",
            id: message.id,
          });

          const email = messageData.data;
          const hasReplied = email.payload.headers.some(
            (header) => header.name === "In-Reply-To"
          );

          if (!hasReplied) {
            // Craft the reply message
            const replyMessage = {
              userId: "me",
              resource: {
                raw: Buffer.from(
                  `To: ${
                    email.payload.headers.find(
                      (header) => header.name === "From"
                    ).value
                  }\r\n` +
                    `Subject: Re: ${
                      email.payload.headers.find(
                        (header) => header.name === "Subject"
                      ).value
                    }\r\n` +
                    `Content-Type: text/plain; charset="UTF-8"\r\n` +
                    `Content-Transfer-Encoding: 7bit\r\n\r\n` +
                    `Thank you for your email. I'm currently on vacation and will reply to you when I return.\r\n`
                ).toString("base64"),
              },
            };

            await gmail.users.messages.send(replyMessage);

            // Add label and move the email
            await gmail.users.messages.modify({
              auth,
              userId: "me",
              id: message.id,
              resource: {
                addLabelIds: [labelId],
                removeLabelIds: ["INBOX"],
              },
            });
          }
        }
      }
    }, Math.floor(Math.random() * (120 - 45 + 1) + 45) * 1000);
  }


  
  main();
  // const labels = response.data.labels;
  res.json({ "this is Auth": auth });
});
const port = 8000;
app.listen(port, () => {
  console.log(`server is running at http://localhost:${port}`);
});
