import os

# Define the game progress file path
progress_file = "adventure_game_progress.txt"

# Check if the progress file exists
if os.path.exists(progress_file):
    # If it exists, load the progress from the file
    with open(progress_file, "r") as file:
        progress = file.read()
else:
    # If it doesn't exist, set the progress to the beginning of the game
    progress = "start"

# Define the game tasks
tasks = {
    "start": "You are in a dark room. You see a door to your left and a window to your right. Which one do you choose?",
    "door": "You open the door and step into a hallway. You see a staircase going up and a hallway leading to the right. Which one do you choose?",
    "window": "You open the window and climb outside. You see a garden below you. You also see a guard walking by. What do you do?",
    "staircase": "You climb up the staircase and reach a door. It's locked. You need a key to open it.",
    "hallway": "You walk down the hallway and reach a room. There's a chest in the room. What do you do?",
    "garden": "You climb down to the garden and hide behind a bush. The guard walks away. You see a path leading to a gate. What do you do?",
    "chest": "You open the chest and find a key inside. You take the key.",
    "gate": "You walk down the path and reach a gate. You use the key to open the gate. You escape!"
}

# Define the game loop
while True:
    # Print the current task
    print(tasks[progress])
    
    # Get user input
    choice = input("> ").lower()
    
    # Define the next task based on user input
    if progress == "start":
        if choice == "door":
            progress = "door"
        elif choice == "window":
            progress = "window"
    elif progress == "door":
        if choice == "staircase":
            progress = "staircase"
        elif choice == "hallway":
            progress = "hallway"
    elif progress == "window":
        if choice == "garden":
            progress = "garden"
    elif progress == "staircase":
        if choice == "chest":
            progress = "chest"
    elif progress == "hallway":
        if choice == "chest":
            progress = "chest"
    elif progress == "garden":
        if choice == "gate":
            progress = "gate"
    
    # Save the progress to the progress file
    with open(progress_file, "w") as file:
        file.write(progress)
    
    # Check if the game is over
    if progress == "gate":
        print("Congratulations! You escaped!")
        break