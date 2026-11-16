export const TAGLINE = "Your body. Your variables. Your projected trajectory.";

export const DISCLAIMER =
  "Trajectory is a wellness and education tool for adults 18 and older. It does not diagnose, treat, or manage a medical condition, and it does not prescribe intake or exercise. The chart uses the published dynamic adult model of Hall and colleagues (Hall et al., Lancet 2011; 378:826–837, and its webappendix). It is not a clinically validated medical device. A projection is a model range, not a promise of what a scale will show. Questions about your health belong with a qualified professional. Nothing in this app changes your plan on its own.";

export const TERMS = [
  "Trajectory helps adults explore dated assumptions about energy intake and activity, and see a body-weight trajectory from the published Hall model.",
  "It is not medical advice, not a diet, and not a prediction of a scale reading on a particular morning.",
  "You choose the plan. The app does not change intake or activity because of a weigh-in, a reminder, or a calibration sketch.",
  "This browser build stores data on this device only. It is not a hosted account, and there is no email verification or password reset.",
  "You can export or delete the local session. Deletion removes it from this browser’s app storage. It cannot erase copies you already downloaded.",
].join(" ");

export const PRIVACY = [
  "This build keeps data in local storage on this device. It does not send profile, weight, intake, or activity values to a server.",
  "The date of birth on the gate is used to enforce the 18+ limit. A profile date of birth is an input to the Hall model’s age terms (Jackson equation and Mifflin–St Jeor).",
  "Health-platform access is optional and is not requested here. Apple Health and Health Connect cannot be connected in a browser. CSV import is a separate choice.",
  "Cycle context, reminders, and body-composition fields are optional and can be turned off. Revoking cycle context can also delete those notes.",
  "There is no advertising use and no sale of data in this build, because the data does not leave the browser unless you export it.",
].join(" ");

export const HOW_TO_READ = [
  "Dots are scale readings you recorded or imported. They are measurements, not the model.",
  "The dashed line is a smoothed trend of those readings. It lags, and days without a reading have no trend value.",
  "The solid line is the published Hall model (Hall et al., Lancet 2011), run from the plan saved in that version. It is not fitted through the dots, and it is not a medical device.",
  "The shaded band is a sensitivity range from the Jackson standard error and the alternate baseline-expenditure closure. It is not a confidence interval and not a promise.",
  "A vertical mark shows today when it falls inside the dates. The model still has a value on past days of the plan; those past values are the saved run, not a rewrite of your readings.",
].join(" ");
