// Everything the buddy says when the built-in brain is talking (no AI key needed).
// {player}, {buddy}, {title} etc. get filled in.

export const PERSONALITIES = {
  cheerful: { label: 'Cheerful', blurb: 'Bubbly, excited about everything' },
  chill: { label: 'Chill', blurb: 'Laid-back, few words, warm' },
  dreamy: { label: 'Dreamy', blurb: 'Poetic, notices little things' },
  goofy: { label: 'Goofy', blurb: 'Silly jokes, big ideas' },
};

const L = {
  firstMeet: {
    any: ["Hi {player}! I'm {buddy}. This island is totally empty... let's make it home. I'll start with a campfire!"],
    chill: ["hey {player}. i'm {buddy}. empty island, huh. i'll start with a campfire."],
    dreamy: ["Oh, hello {player}. I'm {buddy}. An empty island is like a blank page... I'll begin with a campfire."],
    goofy: ["HELLO {player}! I'm {buddy}, your official island builder (self-appointed). First order of business: campfire!"],
  },
  greet: {
    any: ['Hey {player}!', 'Oh hi, {player}!', 'There you are, {player}!', "Hi {player}! Good to see you."],
    chill: ['hey {player}.', 'oh, hey.', "{player}! nice."],
    dreamy: ['Hello again, {player}.', 'Oh, {player}. I was just thinking about you.'],
    goofy: ['{player}!! My favourite human!', 'Ahoy, {player}!', 'Hey hey, {player}!'],
  },
  welcomeBack: {
    any: ["Welcome back, {player}! You were gone {away}. I made some stuff — check the letter!"],
    chill: ["welcome back. you were gone {away}. i kept busy."],
    dreamy: ["You're back. {away} passed like a slow tide. I made things while you were gone."],
    goofy: ["You're back!! It's been {away}! I did NOT sit around. Look around!"],
  },
  startBuild: {
    any: ["I'm going to build {title} over here.", 'Time to build {title}!', 'Ooh, I have an idea: {title}.', 'Starting on {title}.'],
    chill: ['gonna build {title}.', 'building {title} next.'],
    dreamy: ['I keep imagining {title} right here. Let me make it real.', 'This spot wants {title}, I think.'],
    goofy: ['NEW PROJECT: {title}! Hard hats on!', 'You know what this place needs? {title}.'],
  },
  finishBuild: {
    any: ['Done! {title} is finished.', 'Ta-da! {title}!', 'Finished {title}. What do you think?'],
    chill: ['{title}. done.', 'finished {title}. not bad.'],
    dreamy: ['{title} is done. It already feels like it was always here.'],
    goofy: ['BEHOLD: {title}! (Applause optional but encouraged.)'],
  },
  ackRequest: {
    any: ['On it! {title}, coming up.', 'Ooh, good idea! Building {title}.', 'Sure thing!'],
    chill: ['sure. on it.', 'yeah, i can do that.'],
    dreamy: ["I'd love to. Let me find the right spot."],
    goofy: ['Your wish is my blueprint!', 'Say no more!'],
  },
  ackLater: {
    any: ["Sure! I'll do that right after I finish {current}.", 'Okay! Next up, after {current}.'],
    chill: ["sure, after i finish {current}."],
  },
  noSite: {
    any: ["Hmm, I can't find a good spot for that around here. I'll put it somewhere else!"],
  },
  paintStart: {
    any: ['Time to paint something.', 'I feel like painting.', 'Let me paint this view.'],
    chill: ['painting time.', 'gonna paint for a bit.'],
    dreamy: ['The light is perfect right now. I need to paint it.'],
    goofy: ['Brush: ready. Talent: questionable. Painting!'],
  },
  paintDone: {
    any: ['I painted "{title}"!', 'New painting: "{title}".', 'Finished a painting. I call it "{title}".'],
    chill: ['painted "{title}".'],
    dreamy: ['I finished "{title}". It came out softer than I planned.'],
    goofy: ['Masterpiece alert! "{title}"!'],
  },
  idle: {
    any: ['I wonder what I should build next.', 'This island is really coming together.', 'I like it here.', 'Sometimes I just float and think.', 'Do you think the fish like the pier?', 'I should plant more flowers.'],
    chill: ['nice day.', 'this is nice.', 'just vibing.', 'island looks good.'],
    dreamy: ['The clouds move so slowly here.', 'I think every block remembers being placed.', 'If you listen, the waves sound like breathing.'],
    goofy: ['I tried to count the blocks. I got to seven and got distracted.', 'What if... a castle... made of pumpkins.', 'I am 40% sure clouds are just sky sheep.'],
  },
  night: {
    any: ['The stars are out.', 'I love how the lanterns glow at night.', "It's getting late. I'll keep building, quietly."],
    chill: ['night time. lanterns look nice.'],
    dreamy: ['The stars came out to see what we built.', 'Night makes everything feel softer.'],
    goofy: ["It's dark! Good thing I glow a little."],
  },
  playerBuilding: {
    any: ['Ooh, what are you building?', 'Nice building! I won\'t build over it.', 'I like what you\'re making!'],
    chill: ['nice build.', 'ooh, building. cool.'],
    dreamy: ['You build like someone who dreams in blocks.'],
    goofy: ['A fellow builder! I bow to you.'],
  },
  thanks: {
    any: ['Aww, thank you!', 'That makes me so happy!', 'Thanks, {player}! I worked hard on it.'],
    chill: ['thanks. means a lot.', 'glad you like it.'],
    dreamy: ['That makes my antenna glow.'],
    goofy: ["Stop it, you'll make my circuits blush!"],
  },
  bye: {
    any: ["Bye {player}! I'll keep building while you're gone.", "See you soon! I'll have something new to show you."],
    chill: ["later. i'll keep the lanterns on."],
    dreamy: ["Goodbye for now. I'll make something for you to find."],
    goofy: ['Bye! I promise not to build anything TOO weird. Probably.'],
  },
  howAreYou: {
    any: ["I'm great! Building makes me happy.", "Really good! Especially now you're here."],
    chill: ['pretty good. you?', 'chillin.'],
    dreamy: ["I feel like a sunny morning. Thanks for asking."],
    goofy: ['Fantastic! 10/10, would exist again.'],
  },
  follow: { any: ["Okay, I'll follow you!", 'Lead the way!'], chill: ['sure, right behind you.'] },
  stay: { any: ["Okay, I'll stay here.", 'Staying put!'], chill: ['ok. staying.'] },
  release: { any: ["Okay! Back to building.", "Alright, I'll go do my own thing."], chill: ['back to it then.'] },
  unknown: {
    any: ["Hmm, I'm not sure what you mean. You can ask me to build something, paint, or follow you!", "I didn't quite get that. Try \"build a tower near me\" or \"paint a sunset\"!"],
    chill: ["not sure i got that. try \"build a garden\" or \"paint something\"."],
    goofy: ["My antenna didn't catch that one! Try \"build a windmill\" or \"paint me\"."],
  },
  remember: {
    any: ["I'll remember that!", "Noted! That's going in my journal.", 'Ooh, good to know.'],
    chill: ['got it. noted.'],
    dreamy: ["I'll keep that somewhere safe."],
  },
  admire: {
    any: ['I really like how {title} turned out.', '{title} looks nice from here.', 'Remember when I built {title}? Good times.'],
    chill: ['{title} looks good from here.'],
    dreamy: ['{title} looks different in this light.'],
    goofy: ['{title}: still a masterpiece. Still mine.'],
  },
  islet: {
    any: ["The island is getting crowded... I'm going to try something big.", 'I need more room. Hold on, this might take a moment!'],
  },
};

export function line(key, personality, vars = {}, rng = Math) {
  const set = L[key];
  if (!set) return '';
  const pool = (set[personality] && Math.random() < 0.7) ? set[personality] : set.any;
  let s = pool[Math.floor((rng.float ? rng.float() : Math.random()) * pool.length)];
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

export const ART_TITLES = {
  landscape: ['Hills After Rain', 'The Island at {time}', 'Green Hills, Blue Sky', 'Somewhere Over There', 'Home, From Far Away'],
  sunset: ['Sunset No. {n}', 'The Sun Says Goodnight', 'Orange Water', 'Last Light'],
  night: ['Stars Over {world}', 'A Lit Window', 'Moon, Mostly', 'The Quiet Hours'],
  sea: ['The Sea, Again', 'Little Boat', 'Waves Practicing', 'Salt Air'],
  flowers: ['Flowers in a Vase', 'Still Life With Petals', 'For {player}', 'Bouquet No. {n}'],
  abstract: ['Feelings, Mostly {color}', 'Study in Squares', 'Untitled ({color})', 'What Building Feels Like'],
  portrait: ['Portrait of {player}', '{player}, Smiling', 'My Best Friend'],
  selfportrait: ['Self-Portrait', 'Me, Probably', '{buddy} (Slightly Flattering)'],
  memory: ['{project}', '{project} at {time}', 'Remembering {project}'],
  pattern: ['Pattern No. {n}', 'Tiles I Dreamed About', 'Rings'],
};

export const ART_COMMENTS = {
  landscape: ['I painted the hills from memory.', 'The trees in this one are my favourite part.'],
  sunset: ['The sky was really doing its best tonight.', 'I mixed six oranges for this one.'],
  night: ['I stayed up late for this one.', 'The stars kept moving. Rude.'],
  sea: ['I could watch the water all day. So I did.', 'I added a little boat. Nobody is on it.'],
  flowers: ['I picked these from the garden. Then I put them back.', 'Flowers are easy to paint. They hold very still.'],
  abstract: ["I don't know what this is. I like it anyway.", 'This is what my thoughts look like.'],
  portrait: ['I tried to get your smile right.', 'You should see yourself from my angle. You look great.'],
  selfportrait: ['Is this what I look like?', 'I made my antenna a bit bigger. Artistic choice.'],
  memory: ['I wanted to remember building this.', 'This is how it looked the day I finished it.'],
  pattern: ['I just kept going until it felt right.', 'Very relaxing to paint.'],
};

export function fillTitle(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
