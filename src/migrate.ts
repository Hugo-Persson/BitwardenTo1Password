import { promises as fs } from "fs";
import cliProgress from "cli-progress";
import colors from "ansi-colors";
import { exec } from "child_process";
export interface Item {
  passwordHistory: any;
  revisionDate: string;
  creationDate: string;
  deletedDate: any;
  id: string;
  organizationId: any;
  folderId: any;
  type: number;
  reprompt: number;
  name: string;
  notes: any;
  favorite: boolean;
  login: Login;
  collectionIds: any;
}

export interface Login {
  fido2Credentials: any[];
  uris: Uri[];
  username: string;
  password: string;
  totp: string;
}

export interface Uri {
  match: any;
  uri: string;
}

// type: 1 = login, 2 = note
function isWebsite(uri: Uri) {
  const str = uri.uri;
  return str.startsWith("http://") || str.startsWith("https://");
}
function parseLogin(item: Item): any {
  let obj: any = {
    "title": item.name,
    "category": "LOGIN",
    "urls": item.login.uris.filter(isWebsite).map((uri) => {
      return { label: "website", href: uri.uri };
    }),
    "fields": [
      {
        "id": "username",
        "type": "STRING",
        "label": "username",
        "purpose": "USERNAME",
        "value": item.login.username,
      },
      {
        "id": "password",
        "purpose": "PASSWORD",
        "type": "CONCEALED",
        "label": "password",
        "value": item.login.password,
      },
    ],
  };
  if (item.login.totp && item.login.totp.startsWith("otpauth://")) {
    obj.fields.push({
      "id": "otp",
      "label": "otp",
      "type": "OTP",
      "value": item.login.totp,
    });
  }
  if (item.notes && item.notes.length > 0) {
    obj.fields.push(
      {
        "id": "notesPlain",
        "type": "STRING",
        "purpose": "NOTES",
        "label": "notesPlain",
        "value": item.notes,
      },
    );
  }
  return obj;
}
function parseNote(item: Item): any {
  return {
    "title": item.name,
    "category": "SECURE_NOTE",
    "fields": [
      {
        "id": "notesPlain",
        "type": "STRING",
        "purpose": "NOTES",
        "label": "notesPlain",
        "value": item.notes,
      },
    ],
  };
}

function loadTo1Password(index: number, item: any): Promise<boolean> {
  return new Promise<boolean>(async (resolve, reject) => {
    // Create file in /tmp/index.json
    const path = process.cwd() + `/tmp/${index}.json`;
    await fs.writeFile(path, JSON.stringify(item));
    // Exec command `op item create --template ${path}``
    const command = `op item create --template ${path}`;
    exec(command, async (stderr, stdout) => {
      await fs.unlink(path);
      if (stderr) {
        console.log(stderr);
        resolve(false);
      } else {
        console.log(stdout);
        resolve(true);
      }
    });
  });
}

async function run() {
  let startIndex = 300;
  // open file  bitwarden.json and parse json

  const data: Array<Item> = JSON.parse(
    await fs.readFile("bitwarden.json", "utf8"),
  ).items;
  const parsed = data.filter((item) => item.name !== "--").map((item) => {
    if (item.type === 1) {
      return parseLogin(item);
    } else if (item.type === 2) {
      return parseNote(item);
    }
    return null;
  }).filter((item) => item);

  // note: you have to install this dependency manually since it's not required by cli-progress

  // create new progress bar
  const b1 = new cliProgress.SingleBar({
    format: "CLI Progress |" + colors.cyan("{bar}") +
      "| {percentage}% || {value}/{total} Chunks || Speed: {speed}",
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591",
    hideCursor: true,
  });

  // initialize the bar - defining payload token "speed" with the default value "N/A"
  b1.start(parsed.length , startIndex, {
    speed: "N/A",
  });
  for (let index = startIndex; index < parsed.length; index++) {
    if (await loadTo1Password(index, parsed[index])) {
      b1.increment();
    } else {
      console.log("Retrying in 500 seconds");
      await new Promise((resolve) => setTimeout(resolve, 1000 * 500));
      index--;
    }
  }

  b1.stop();
}

run();
