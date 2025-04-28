from langchain_openai import ChatOpenAI
from pydantic import BaseModel
from typing import List

class StoryCharacter(BaseModel):
    name: str
    description: str
    traits: List[str]


llm = ChatOpenAI(model="gpt-4o-mini", temperature=0).with_structured_output(StoryCharacter)

prompt = "based on the following story, create a list of characters: {story}"

story = open("story.txt").read()

print(llm.invoke(prompt.format(story=story)))